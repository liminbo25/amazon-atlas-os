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

async function uploadRemoteImageToBlob(source: string, folder: string) {
  const response = await fetch(source);

  if (!response.ok) {
    throw new Error(`Failed to fetch generated image: HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "image/png";

  if (!contentType.toLowerCase().startsWith("image/")) {
    throw new Error(`Generated response is not an image: ${contentType}`);
  }

  if (!response.body) {
    throw new Error("Generated image response has no readable body.");
  }

  const pathname = createBlobPath(
    folder,
    getImageExtensionFromMimeType(contentType)
  );

  return put(pathname, response.body, {
    access: "public",
    addRandomSuffix: false,
    contentType,
  });
}

async function uploadDataUrlToBlob(source: string, folder: string) {
  const match = source.match(DATA_URL_PATTERN);

  if (!match) {
    throw new Error("Generated image data URL is invalid.");
  }

  const [, contentType, base64Data] = match;
  const buffer = Buffer.from(base64Data, "base64");
  const pathname = createBlobPath(
    folder,
    getImageExtensionFromMimeType(contentType)
  );

  return put(pathname, buffer, {
    access: "public",
    addRandomSuffix: false,
    contentType,
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
