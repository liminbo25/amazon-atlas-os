import { analyzeProductImages } from "@/lib/claude-vision-client";
import {
  RouteError,
  readAiRuntimeConfig,
  readJsonBody,
  toErrorResponse,
} from "@/lib/ai-route-helpers";

const MAX_IMAGE_COUNT = 10;
const SUPPORTED_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const DATA_URL_PATTERN = /^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i;
const BASE64_PATTERN = /^[A-Za-z0-9+/=\s]+$/;

interface ImagePayload {
  data: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const runtimeConfig = readAiRuntimeConfig(body, request);
    const images = validateImagePayload(body.images);
    const result = await analyzeProductImages(images, runtimeConfig);

    return Response.json(result);
  } catch (error: unknown) {
    if (!(error instanceof RouteError) || error.status >= 500) {
      const code = error instanceof RouteError ? error.code : "unexpected_error";
      console.error("[analyze-images] request_failed", { code });
    }

    return toErrorResponse(error, "Image analysis failed.");
  }
}

function validateImagePayload(value: unknown): ImagePayload[] {
  if (!Array.isArray(value)) {
    throw new RouteError("images must be an array.", {
      status: 400,
      code: "images_invalid",
    });
  }

  if (value.length === 0) {
    throw new RouteError("At least one product image is required.", {
      status: 400,
      code: "images_required",
    });
  }

  if (value.length > MAX_IMAGE_COUNT) {
    throw new RouteError(`A maximum of ${MAX_IMAGE_COUNT} images is supported.`, {
      status: 400,
      code: "images_too_many",
    });
  }

  return value.map((item, index) => normalizeImageItem(item, index));
}

function normalizeImageItem(value: unknown, index: number): ImagePayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RouteError(`images[${index}] must be an object.`, {
      status: 400,
      code: "image_invalid",
    });
  }

  const record = value as Record<string, unknown>;
  const rawData = typeof record.data === "string" ? record.data.trim() : "";
  const rawMediaType =
    typeof record.mediaType === "string" ? record.mediaType.trim().toLowerCase() : "";

  if (!rawData) {
    throw new RouteError(`images[${index}].data is required.`, {
      status: 400,
      code: "image_data_required",
    });
  }

  let data = rawData;
  let mediaType = rawMediaType as ImagePayload["mediaType"] | "";

  const dataUrlMatch = rawData.match(DATA_URL_PATTERN);
  if (dataUrlMatch) {
    mediaType = dataUrlMatch[1].toLowerCase() as ImagePayload["mediaType"];
    data = dataUrlMatch[2];
  }

  if (!mediaType) {
    throw new RouteError(`images[${index}].mediaType is required.`, {
      status: 400,
      code: "image_media_type_required",
    });
  }

  if (!SUPPORTED_MEDIA_TYPES.has(mediaType)) {
    throw new RouteError(
      `images[${index}] uses unsupported mediaType "${mediaType}".`,
      {
        status: 400,
        code: "image_media_type_unsupported",
      }
    );
  }

  const normalizedData = data.replace(/\s+/g, "");
  if (!normalizedData || !BASE64_PATTERN.test(normalizedData)) {
    throw new RouteError(`images[${index}] is not valid base64 image data.`, {
      status: 400,
      code: "image_data_invalid",
    });
  }

  return {
    data: normalizedData,
    mediaType: mediaType as ImagePayload["mediaType"],
  };
}
