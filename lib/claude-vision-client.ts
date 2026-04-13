import {
  type AiImageInput,
  type AiRuntimeConfig,
  type AiVisionCompletionOptions,
  RouteError,
  getRetryPromptSuffix,
  isRecord,
  normalizeStringValue,
  normalizeTextList,
  requestAiVisionCompletion,
  requestStructuredJson,
  resolveAiConfig,
} from "./ai-route-helpers";
import type { VisionAnalysisResult } from "./types";

const DEFAULT_MODEL = "vision-model";

const ANALYSIS_SYSTEM_PROMPT = [
  "You analyze product images for an internal Amazon listing workflow.",
  "Return only one valid JSON object.",
  "Do not use markdown code fences.",
  "Do not add any explanation before or after the JSON.",
].join(" ");

const ANALYSIS_PROMPT = `
Analyze the uploaded product images and answer in Simplified Chinese.

Return exactly one JSON object with this schema:
{
  "appearance": "overall visual appearance",
  "material": "likely material or finish",
  "features": ["feature 1", "feature 2", "feature 3"],
  "sellingPoints": ["selling point 1", "selling point 2", "selling point 3"],
  "suggestions": "copywriting suggestions for the listing"
}

Requirements:
- Only describe what is visible in the images.
- Keep the result specific and useful for listing copywriting.
- If a detail is uncertain, say it is likely or visually inferred instead of making a hard claim.
`.trim();

type SupportedImageMediaType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/gif";

interface ImagePayload extends AiImageInput {
  mediaType: SupportedImageMediaType;
}

export async function analyzeProductImages(
  imageBase64List: ImagePayload[],
  runtimeConfig?: AiRuntimeConfig
): Promise<VisionAnalysisResult> {
  if (!Array.isArray(imageBase64List) || imageBase64List.length === 0) {
    throw new RouteError("At least one product image is required.", {
      status: 400,
      code: "images_required",
    });
  }

  const config = resolveAiConfig({
    runtimeConfig,
    defaultModel: DEFAULT_MODEL,
  });

  return requestStructuredJson<VisionAnalysisResult>({
    operationName: "image analysis",
    requestText: async (attempt) => {
      const request: AiVisionCompletionOptions = {
        config,
        operationName: "image analysis",
        systemPrompt: ANALYSIS_SYSTEM_PROMPT,
        userPrompt: `${ANALYSIS_PROMPT}\n${getRetryPromptSuffix(attempt)}`.trim(),
        images: imageBase64List,
        maxTokens: 2000,
        temperature: 0,
      };

      return requestAiVisionCompletion(request);
    },
    parseResult: parseVisionAnalysisResult,
  });
}

function parseVisionAnalysisResult(value: unknown): VisionAnalysisResult {
  if (!isRecord(value)) {
    throw new RouteError("Image analysis returned an invalid JSON shape.", {
      status: 502,
      code: "vision_invalid_shape",
      retryable: true,
    });
  }

  const result: VisionAnalysisResult = {
    appearance: normalizeStringValue(value.appearance),
    material: normalizeStringValue(value.material),
    features: normalizeTextList(value.features, { maxItems: 8, unique: true }),
    sellingPoints: normalizeTextList(value.sellingPoints, {
      maxItems: 5,
      unique: true,
    }),
    suggestions: normalizeStringValue(value.suggestions),
  };

  const hasUsefulContent =
    Boolean(result.appearance) ||
    Boolean(result.material) ||
    result.features.length > 0 ||
    result.sellingPoints.length > 0 ||
    Boolean(result.suggestions);

  if (!hasUsefulContent) {
    throw new RouteError("Image analysis returned an empty result.", {
      status: 502,
      code: "vision_empty_result",
      retryable: true,
    });
  }

  return result;
}
