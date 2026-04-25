export interface ImageDimensions {
  width: number;
  height: number;
}

export type TryOnAspectModel = "nano_banana_pro" | "image2";

const NANO_BANANA_TRYON_SIZES = [
  "1024x1024",
  "1024x1536",
  "1536x1024",
] as const;

const IMAGE2_TRYON_SIZES = [
  "1024x1024",
  "1024x1792",
  "1792x1024",
  "822x1920",
  "1920x822",
] as const;

function isPositiveDimension(value: number) {
  return Number.isFinite(value) && value > 0;
}

export function isValidImageDimensions(
  dimensions?: Partial<ImageDimensions> | null
): dimensions is ImageDimensions {
  return (
    Boolean(dimensions) &&
    isPositiveDimension(dimensions?.width ?? 0) &&
    isPositiveDimension(dimensions?.height ?? 0)
  );
}

export function getAspectRatio(dimensions: ImageDimensions) {
  return dimensions.width / dimensions.height;
}

export function parseImageSize(size: string): ImageDimensions | null {
  const match = size.trim().toLowerCase().match(/^(\d+)x(\d+)$/);

  if (!match) {
    return null;
  }

  const width = Number(match[1]);
  const height = Number(match[2]);

  return isValidImageDimensions({ width, height }) ? { width, height } : null;
}

export function formatImageSize(dimensions: ImageDimensions) {
  return `${Math.round(dimensions.width)}x${Math.round(dimensions.height)}`;
}

export function getTryOnSupportedSizes(model: TryOnAspectModel) {
  return model === "image2" ? IMAGE2_TRYON_SIZES : NANO_BANANA_TRYON_SIZES;
}

export function getClosestTryOnSizeForAspect(
  model: TryOnAspectModel,
  dimensions?: Partial<ImageDimensions> | null
) {
  const supportedSizes = getTryOnSupportedSizes(model);

  if (!isValidImageDimensions(dimensions)) {
    return supportedSizes[0];
  }

  const targetRatio = getAspectRatio(dimensions);
  let bestSize: string = supportedSizes[0];
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const size of supportedSizes) {
    const parsedSize = parseImageSize(size);

    if (!parsedSize) {
      continue;
    }

    const ratio = getAspectRatio(parsedSize);
    const distance = Math.abs(Math.log(ratio / targetRatio));

    if (distance < bestDistance) {
      bestDistance = distance;
      bestSize = size;
    }
  }

  return bestSize;
}

export function getCanvasDimensionsForAspect(
  sourceDimensions: ImageDimensions,
  targetDimensions: ImageDimensions,
  maxEdge = 2048
): ImageDimensions {
  const targetRatio = getAspectRatio(targetDimensions);
  const cappedEdge = Math.max(
    1,
    Math.min(
      Math.max(sourceDimensions.width, sourceDimensions.height),
      maxEdge
    )
  );

  if (targetRatio >= 1) {
    return {
      width: Math.round(cappedEdge),
      height: Math.max(1, Math.round(cappedEdge / targetRatio)),
    };
  }

  return {
    width: Math.max(1, Math.round(cappedEdge * targetRatio)),
    height: Math.round(cappedEdge),
  };
}
