import { lookup } from "node:dns/promises";
import net from "node:net";

import { NextRequest, NextResponse } from "next/server";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 15_000;
const DATA_IMAGE_PATTERN = /^data:image\/[a-z0-9.+-]+;base64,/i;
const BLOCKED_HOSTS = new Set(["localhost", "0.0.0.0"]);

export async function POST(request: NextRequest) {
  try {
    const { imageUrl } = (await request.json()) as { imageUrl?: string };

    if (!imageUrl) {
      return NextResponse.json(
        { success: false, error: "缺少图片 URL。" },
        { status: 400 }
      );
    }

    if (DATA_IMAGE_PATTERN.test(imageUrl)) {
      if (Buffer.byteLength(imageUrl, "utf8") > MAX_IMAGE_BYTES * 1.4) {
        return imageTooLargeResponse();
      }

      return NextResponse.json({
        success: true,
        data: imageUrl,
      });
    }

    const url = await validateRemoteImageUrl(imageUrl);
    const response = await fetchRemoteImage(url);

    if (!response.ok) {
      throw new Error(`图片下载失败，HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "image/png";
    if (!contentType.toLowerCase().startsWith("image/")) {
      throw new Error(`远程地址返回的不是图片：${contentType}`);
    }

    const contentLength = Number(response.headers.get("content-length") ?? "0");
    if (contentLength > MAX_IMAGE_BYTES) {
      return imageTooLargeResponse();
    }

    const arrayBuffer = await readResponseBodyWithLimit(response);
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    return NextResponse.json({
      success: true,
      data: `data:${contentType};base64,${base64}`,
    });
  } catch (error) {
    console.error("Download proxy error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "下载失败。",
      },
      { status: 500 }
    );
  }
}

async function fetchRemoteImage(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

  try {
    return await fetch(url, {
      redirect: "error",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function validateRemoteImageUrl(rawValue: string): Promise<string> {
  let url: URL;

  try {
    url = new URL(rawValue);
  } catch {
    throw new Error("图片 URL 格式不正确。");
  }

  if (url.protocol !== "https:") {
    throw new Error("远程图片必须使用 HTTPS 地址。");
  }

  if (url.username || url.password) {
    throw new Error("图片 URL 不能包含认证信息。");
  }

  const hostname = url.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(hostname) || isPrivateIp(hostname)) {
    throw new Error("不允许下载内网或本机地址。");
  }

  const records = await lookup(hostname, { all: true, verbatim: true });
  if (records.length === 0 || records.some((record) => isPrivateIp(record.address))) {
    throw new Error("不允许下载解析到内网或本机的地址。");
  }

  url.hash = "";
  return url.toString();
}

async function readResponseBodyWithLimit(response: Response): Promise<ArrayBuffer> {
  if (!response.body) {
    return response.arrayBuffer();
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    totalBytes += value.byteLength;
    if (totalBytes > MAX_IMAGE_BYTES) {
      reader.cancel().catch(() => undefined);
      throw new Error("图片过大，请上传小于 8MB 的图片。");
    }

    chunks.push(value);
  }

  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return merged.buffer;
}

function imageTooLargeResponse(): NextResponse {
  return NextResponse.json(
    { success: false, error: "图片过大，请上传小于 8MB 的图片。" },
    { status: 413 }
  );
}

function isPrivateIp(value: string): boolean {
  const normalized = value.replace(/^\[|\]$/g, "");
  const ipVersion = net.isIP(normalized);

  if (ipVersion === 4) {
    const parts = normalized.split(".").map((part) => Number.parseInt(part, 10));
    const [first = 0, second = 0] = parts;

    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168)
    );
  }

  if (ipVersion === 6) {
    const lowerValue = normalized.toLowerCase();
    return (
      lowerValue === "::" ||
      lowerValue === "::1" ||
      lowerValue.startsWith("fc") ||
      lowerValue.startsWith("fd") ||
      lowerValue.startsWith("fe80:")
    );
  }

  return false;
}
