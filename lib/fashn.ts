export type FashnGenerationMode = "balanced" | "quality";
export type FashnResolution = "1k" | "2k" | "4k";
export type FashnOutputFormat = "png" | "jpeg";
export type FashnPredictionStatus =
  | "starting"
  | "in_queue"
  | "processing"
  | "completed"
  | "failed";

export interface ResolvedFashnConfig {
  apiKey: string | null;
  baseUrl: string;
  model: string;
  generationMode: FashnGenerationMode;
  resolution: FashnResolution;
  outputFormat: FashnOutputFormat;
}

export interface FashnRunResponse {
  id?: string;
  error?: unknown;
}

export interface FashnStatusResponse {
  id?: string;
  status?: FashnPredictionStatus;
  output?: string[];
  error?: {
    name?: string;
    message?: string;
  } | string | null;
}

const DEFAULT_FASHN_API_BASE_URL = "https://api.fashn.ai";
const DEFAULT_FASHN_MODEL = "tryon-max";
const DEFAULT_FASHN_GENERATION_MODE: FashnGenerationMode = "quality";
const DEFAULT_FASHN_RESOLUTION: FashnResolution = "2k";
const DEFAULT_FASHN_OUTPUT_FORMAT: FashnOutputFormat = "png";

function normalizeFashnApiBaseUrl(rawValue?: string) {
  const trimmed = rawValue?.trim();

  if (!trimmed) {
    return `${DEFAULT_FASHN_API_BASE_URL}/v1`;
  }

  const normalized = trimmed.replace(/\/+$/, "");

  if (/\/v\d+$/i.test(normalized)) {
    return normalized;
  }

  return `${normalized}/v1`;
}

function normalizeFashnGenerationMode(
  rawValue?: string
): FashnGenerationMode {
  return rawValue === "balanced" || rawValue === "quality"
    ? rawValue
    : DEFAULT_FASHN_GENERATION_MODE;
}

function normalizeFashnResolution(rawValue?: string): FashnResolution {
  return rawValue === "1k" || rawValue === "2k" || rawValue === "4k"
    ? rawValue
    : DEFAULT_FASHN_RESOLUTION;
}

function normalizeFashnOutputFormat(rawValue?: string): FashnOutputFormat {
  return rawValue === "jpeg" || rawValue === "png"
    ? rawValue
    : DEFAULT_FASHN_OUTPUT_FORMAT;
}

export function resolveFashnConfig(): ResolvedFashnConfig {
  return {
    apiKey: process.env.FASHN_API_KEY?.trim() || null,
    baseUrl: normalizeFashnApiBaseUrl(process.env.FASHN_API_BASE_URL),
    model: process.env.FASHN_MODEL?.trim() || DEFAULT_FASHN_MODEL,
    generationMode: normalizeFashnGenerationMode(
      process.env.FASHN_GENERATION_MODE?.trim()
    ),
    resolution: normalizeFashnResolution(process.env.FASHN_RESOLUTION?.trim()),
    outputFormat: normalizeFashnOutputFormat(
      process.env.FASHN_OUTPUT_FORMAT?.trim()
    ),
  };
}

export function getFashnErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "string" && error.trim()) {
    return error;
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.trim()
  ) {
    return error.message;
  }

  return fallback;
}

export function buildFashnAuthHeaders(apiKey: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
}
