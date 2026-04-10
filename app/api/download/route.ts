import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { imageUrl } = await request.json();

    if (!imageUrl) {
      return NextResponse.json(
        { success: false, error: '缺少图片 URL' },
        { status: 400 }
      );
    }

    // 如果是 base64，直接返回
    if (imageUrl.startsWith('data:image/')) {
      return NextResponse.json({
        success: true,
        data: imageUrl,
      });
    }

    // 如果是 URL，通过服务器代理获取
    console.log('代理下载图片:', imageUrl);
    const response = await fetch(imageUrl);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString('base64');

    // 获取 content-type
    const contentType = response.headers.get('content-type') || 'image/png';

    if (!contentType.toLowerCase().startsWith('image/')) {
      throw new Error(`远程地址返回的不是图片：${contentType}`);
    }

    return NextResponse.json({
      success: true,
      data: `data:${contentType};base64,${base64}`,
    });

  } catch (error) {
    console.error('下载代理错误:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '下载失败'
      },
      { status: 500 }
    );
  }
}
