import { NextRequest, NextResponse } from 'next/server';

export interface GeminiRequest {
  image?: string;
  clothingImage?: string;
  modelImage?: string;
  prompt?: string;
  type?: 'virtual-tryon' | 'model-swap';
  size?: string;
}

export interface GeminiResponse {
  success: boolean;
  result?: string;
  error?: string;
}

function normalizeImageForProvider(image: string) {
  const trimmed = image.trim();

  if (trimmed.startsWith('data:image/')) {
    return trimmed;
  }

  const base64Data = trimmed.includes(',') ? trimmed.split(',')[1] : trimmed;
  return `data:image/png;base64,${base64Data}`;
}

async function requestImageGeneration(
  apiBaseUrl: string,
  geminiApiKey: string,
  payload: Record<string, unknown>
) {
  const response = await fetch(`${apiBaseUrl}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${geminiApiKey}`,
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();

  return {
    ok: response.ok,
    status: response.status,
    responseText,
  };
}

function parseImageGenerationResponse(responseText: string) {
  try {
    return JSON.parse(responseText);
  } catch {
    throw new Error(`图片接口返回了非 JSON 内容：${responseText.slice(0, 200)}`);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: GeminiRequest = await request.json();
    const { image, prompt, clothingImage, modelImage, type = 'model-swap', size } = body;

    const geminiApiKey = process.env.GEMINI_API_KEY;
    const apiBaseUrl = process.env.GEMINI_API_BASE_URL || 'https://ai.yijiarj.cn/v1';

    if (!geminiApiKey) {
      return NextResponse.json(
        { success: false, error: '未配置 GEMINI_API_KEY 环境变量' },
        { status: 500 }
      );
    }

    // Virtual Try-On: clothing image + model image
    if (type === 'virtual-tryon') {
      if (!clothingImage || !modelImage) {
        return NextResponse.json(
          { success: false, error: '缺少衣服图或模特图' },
          { status: 400 }
        );
      }

      const clothingImageData = normalizeImageForProvider(clothingImage);
      const modelImageData = normalizeImageForProvider(modelImage);

      const virtualTryOnPrompt = `Virtual try-on task: Transfer the exact clothing from image 1 onto the person in image 2.

CRITICAL REQUIREMENTS:
1. CLOTHING PRESERVATION (HIGHEST PRIORITY):
   - Copy the EXACT garment from image 1: every pattern, color, texture, print, logo, and design detail must be IDENTICAL
   - Preserve fabric type, material appearance, and surface texture
   - Keep all decorative elements: buttons, zippers, pockets, seams, stitching
   - Maintain the original color palette precisely - no color shifts or alterations

2. GARMENT FITTING:
   - Naturally fit the clothing to the person's body shape and pose in image 2
   - Adjust garment draping and wrinkles to match body contours realistically
   - Ensure proper garment length, sleeve fit, and overall proportions

3. PERSON PRESERVATION:
   - Keep the person's face, body, pose, and background from image 2 completely unchanged
   - Only replace the clothing area

4. LIGHTING & REALISM:
   - Match lighting, shadows, and highlights to the environment in image 2
   - Create realistic fabric shadows and body contours
   - Ensure seamless integration between clothing and person

OUTPUT: A photorealistic 4K ultra-high-definition image showing the person from image 2 wearing the exact clothing from image 1, with perfect detail preservation, sharp textures, and natural appearance. The output must be crisp and detailed at full resolution.`;

      const generationPayload = {
        model: 'nano_banana_pro',
        prompt: virtualTryOnPrompt,
        // 两张图都传入 image 数组：第一张是衣服参考图，第二张是模特图
        image: [clothingImageData, modelImageData],
        n: 1,
        size: size || '1024x1536',
        quality: 'hd',
        style: 'natural',
      };

      let apiResult = await requestImageGeneration(
        apiBaseUrl,
        geminiApiKey,
        generationPayload
      );

      console.log('API 响应状态:', apiResult.status);

      if (!apiResult.ok && generationPayload.size !== '1024x1024') {
        console.warn(
          '首次图片生成失败，改用 1024x1024 重试:',
          apiResult.status,
          apiResult.responseText.slice(0, 300)
        );

        apiResult = await requestImageGeneration(apiBaseUrl, geminiApiKey, {
          ...generationPayload,
          size: '1024x1024',
        });
      }

      if (!apiResult.ok) {
        console.error('❌ API error:', apiResult.status, apiResult.responseText);
        return NextResponse.json(
          { success: false, error: `API 请求失败：${apiResult.status} - ${apiResult.responseText}` },
          { status: apiResult.status }
        );
      }

      const data = parseImageGenerationResponse(apiResult.responseText);
      console.log('API 返回数据结构:', JSON.stringify(data).substring(0, 200));

      // OpenAI 兼容格式：data.data[0].url 或 data.data[0].b64_json
      if (data.data && data.data[0]) {
        let result: string;

        // 检查 b64_json 字段
        if (data.data[0].b64_json) {
          const b64Data = data.data[0].b64_json;

          // 判断是 URL 还是真正的 base64
          if (b64Data.startsWith('http://') || b64Data.startsWith('https://')) {
            // 实际上是 URL
            result = b64Data;
            console.log('✅ 成功生成图片，类型: URL (来自 b64_json 字段)');
          } else {
            // 真正的 base64 数据
            result = `data:image/png;base64,${b64Data}`;
            console.log('✅ 成功生成图片，类型: base64');
          }
        } else if (data.data[0].url) {
          // 使用 url 字段
          result = data.data[0].url;
          console.log('✅ 成功生成图片，类型: URL (来自 url 字段)');
        } else {
          console.error('❌ 未找到图片数据');
          return NextResponse.json(
            { success: false, error: 'API 返回中未找到图片数据' },
            { status: 500 }
          );
        }

        console.log('结果长度:', result.length);
        console.log('结果前缀:', result.substring(0, 100));

        return NextResponse.json({
          success: true,
          result: result
        });
      }

      if (data.error) {
        return NextResponse.json(
          { success: false, error: data.error.message || 'API 错误' },
          { status: 500 }
        );
      }

      return NextResponse.json(
        { success: false, error: 'API 返回中未找到生成的图片' },
        { status: 500 }
      );
    }

    // Model Swap: single image + prompt (original functionality)
    if (!image || !prompt) {
      return NextResponse.json(
        { success: false, error: '缺少图片或提示词' },
        { status: 400 }
      );
    }

    const imageData = normalizeImageForProvider(image);

    const enhancedPrompt = `请将此服装图片中的模特替换为：${prompt}。重要要求：
1. 保持服装完全不变，包括款式、颜色、花纹、图案、材质质感都必须与原图一致
2. 只替换人物模特，新模特要与原服装风格搭配协调
3. 背景可以适当调整以配合新模特
4. 保持原图的光影和色调风格
5. 生成高质量的模特展示图`;

    // OpenAI 兼容格式请求
    const apiResult = await requestImageGeneration(apiBaseUrl, geminiApiKey, {
      model: 'nano_banana_pro',
      prompt: enhancedPrompt,
      image: [imageData],
      n: 1,
      size: '1024x1536',
    });

    if (!apiResult.ok) {
      console.error('API error:', apiResult.status, apiResult.responseText);
      return NextResponse.json(
        { success: false, error: `API 请求失败：${apiResult.status} - ${apiResult.responseText}` },
        { status: apiResult.status }
      );
    }

    const data = parseImageGenerationResponse(apiResult.responseText);

    if (data.data && data.data[0]) {
      let result: string;

      // 检查 b64_json 字段
      if (data.data[0].b64_json) {
        const b64Data = data.data[0].b64_json;

        // 判断是 URL 还是真正的 base64
        if (b64Data.startsWith('http://') || b64Data.startsWith('https://')) {
          // 实际上是 URL
          result = b64Data;
        } else {
          // 真正的 base64 数据
          result = `data:image/png;base64,${b64Data}`;
        }
      } else if (data.data[0].url) {
        // 使用 url 字段
        result = data.data[0].url;
      } else {
        return NextResponse.json(
          { success: false, error: 'API 返回中未找到图片数据' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        result: result
      });
    }

    if (data.error) {
      return NextResponse.json(
        { success: false, error: data.error.message || 'API 错误' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'API 返回中未找到生成的图片' },
      { status: 500 }
    );

  } catch (error) {
    console.error('API route error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '服务器内部错误' },
      { status: 500 }
    );
  }
}
