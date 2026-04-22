import { put } from "@vercel/blob";
import { randomUUID } from "node:crypto";

export const IMAGE_BLOB_ALLOWED_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

export const IMAGE_BLOB_MAX_BYTES = 25 * 1024 * 1024;

const DATA_URL_PATTERN =
  /^data:([^;,]+)(?:;charset=[^;,]+)?;base64,(.+)$/i;
const IMAGE_BLOB_FETCH_TIMEOUT_MS = 20_000;
const IMAGE_BLOB_UPLOAD_MAX_ATTEMPTS = 3;
const IMAGE_BLOB_RETRYABLE_ERROR_CODES = new Set([
  "ECONNABORTED",
  "ECONNRESET",
  "ECONNREFUSED",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EPIPE",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
]);

export function isRemoteImageUrl(value: string) {
  return value.startsWith("http://") || value.startsWith("https://");
}

export function isDataImageUrl(value: string) {
  return value.startsWith("data:image/");
}

export function isSupportedImageUrl(value: string) {
  return isRemoteImageUrl(value) || isDataImageUrl(value);
}

export function getImageExtensionFromMimeType(mimeType: string) {
  switch (mimeType.toLowerCase()) {
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/png":
    default:
      return "png";
  }
}

export function sanitizeImageFilename(filename: string) {
  const trimmed = filename.trim().toLowerCase();
  const replaced = trimmed.replace(/[^a-z0-9._-]+/g, "-");
  return replaced.replace(/-+/g, "-").replace(/^-|-$/g, "") || "image";
}

function createBlobPath(folder: string, extension: string) {
  const normalizedFolder = folder.replace(/^\/+|\/+$/g, "");
  return `${normalizedFolder}/${Date.now()}-${randomUUID()}.${extension}`;
}

function sleep(delayMs: number) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function extractErrorCode(error: unknown) {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const maybeError = error as {
    code?: string;
    cause?: { code?: string };
  };

  return maybeError.code ?? maybeError.cause?.code;
}

function isRetryableBlobUploadError(error: unknown) {
  const code = extractErrorCode(error);

  if (code && IMAGE_BLOB_RETRYABLE_ERROR_CODES.has(code)) {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  const normalized = error.message.toLowerCase();

  if (
    normalized.includes("must be a public url or a data url") ||
    normalized.includes("not an image") ||
    normalized.includes("invalid") ||
    normalized.includes("exceeds the maximum")
  ) {
    return false;
  }

  return (
    normalized.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("fetch failed") ||
    normalized.includes("network") ||
    normalized.includes("socket") ||
    normalized.includes("temporar") ||
    normalized.includes("econn") ||
    normalized.includes("429") ||
    normalized.includes("502") ||
    normalized.includes("503") ||
    normalized.includes("504")
  );
}

async function withBlobUploadRetry<T>(operation: () => Promise<T>) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= IMAGE_BLOB_UPLOAD_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (
        !isRetryableBlobUploadError(error) ||
        attempt >= IMAGE_BLOB_UPLOAD_MAX_ATTEMPTS
      ) {
        throw error;
      }

      await sleep(300 * attempt);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Blob upload failed after retries.");
}

async function fetchRemoteImageBuffer(source: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_BLOB_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(source, {
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch generated image: HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "image/png";

    if (!contentType.toLowerCase().startsWith("image/")) {
      throw new Error(`Generated response is not an image: ${contentType}`);
    }

    const contentLength = Number(response.headers.get("content-length") || "");

    if (Number.isFinite(contentLength) && contentLength > IMAGE_BLOB_MAX_BYTES) {
      throw new Error("Generated image exceeds the maximum supported upload size.");
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    if (buffer.byteLength > IMAGE_BLOB_MAX_BYTES) {
      throw new Error("Generated image exceeds the maximum supported upload size.");
    }

    return {
      buffer,
      contentType,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === "AbortError"
    ) {
      const timeoutError = new Error(
        `Timed out while fetching generated image after ${IMAGE_BLOB_FETCH_TIMEOUT_MS}ms.`
      ) as Error & { code?: string };
      timeoutError.code = "UND_ERR_HEADERS_TIMEOUT";
      throw timeoutError;
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function uploadRemoteImageToBlob(source: string, folder: string) {
  return withBlobUploadRetry(async () => {
    const { buffer, contentType } = await fetchRemoteImageBuffer(source);
    const pathname = createBlobPath(
      folder,
      getImageExtensionFromMimeType(contentType)
    );

    return put(pathname, buffer, {
      access: "public",
      addRandomSuffix: false,
      contentType,
    });
  });
}

async function uploadDataUrlToBlob(source: string, folder: string) {
  const match = source.match(DATA_URL_PATTERN);

  if (!match) {
    throw new Error("Generated image data URL is invalid.");
  }

  const [, contentType, base64Data] = match;

  if (!contentType.toLowerCase().startsWith("image/")) {
    throw new Error(`Generated response is not an image: ${contentType}`);
  }

  const buffer = Buffer.from(base64Data, "base64");

  if (buffer.byteLength > IMAGE_BLOB_MAX_BYTES) {
    throw new Error("Generated image exceeds the maximum supported upload size.");
  }

  const pathname = createBlobPath(
    folder,
    getImageExtensionFromMimeType(contentType)
  );

  return withBlobUploadRetry(async () => {
    return put(pathname, buffer, {
      access: "public",
      addRandomSuffix: false,
      contentType,
    });
  });
}

export async function uploadImageSourceToBlob(source: string, folder: string) {
  if (isRemoteImageUrl(source)) {
    return uploadRemoteImageToBlob(source, folder);
  }

  if (isDataImageUrl(source)) {
    return uploadDataUrlToBlob(source, folder);
  }

  throw new Error("Image source must be a public URL or a data URL.");
}
