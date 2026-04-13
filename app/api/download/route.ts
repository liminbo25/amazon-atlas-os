import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { imageUrl } = (await request.json()) as { imageUrl?: string };

    if (!imageUrl) {
      return NextResponse.json(
        { success: false, error: "缺少图片 URL。" },
        { status: 400 }
      );
    }

    if (imageUrl.startsWith("data:image/")) {
      return NextResponse.json({
        success: true,
        data: imageUrl,
      });
    }

    const response = await fetch(imageUrl);

    if (!response.ok) {
      throw new Error(`下载图片失败，HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "image/png";

    if (!contentType.toLowerCase().startsWith("image/")) {
      throw new Error(`远程地址返回的不是图片：${contentType}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString("base64");

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
