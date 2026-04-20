import type { AiRuntimeServiceKey } from "@/lib/types";

type ListingRuntimeTask = AiRuntimeServiceKey | "legacyCopyDiagnosis";

const FALLBACK_OPENAI_MODEL = "gpt-5.4-mini";
const FALLBACK_ANTHROPIC_MODEL = "claude-sonnet-4-20250514";
const FALLBACK_IMAGE_MODEL = "claude-sonnet-4-20250514";

export function getListingDefaultModel(task: ListingRuntimeTask): string {
  const explicitProvider = readProvider(process.env.AI_PROVIDER);

  if (explicitProvider === "anthropic") {
    return readNonEmptyEnv("ANTHROPIC_MODEL") || fallbackModelForTask(task, "anthropic");
  }

  if (explicitProvider === "openai") {
    return (
      readNonEmptyEnv("OPENAI_MODEL") ||
      readNonEmptyEnv("GEMINI_MODEL") ||
      fallbackModelForTask(task, "openai")
    );
  }

  if (hasAnthropicRuntime()) {
    return readNonEmptyEnv("ANTHROPIC_MODEL") || fallbackModelForTask(task, "anthropic");
  }

  if (hasOpenAiLikeRuntime()) {
    return (
      readNonEmptyEnv("OPENAI_MODEL") ||
      readNonEmptyEnv("GEMINI_MODEL") ||
      fallbackModelForTask(task, "openai")
    );
  }

  return task === "imageAnalysis" ? FALLBACK_IMAGE_MODEL : FALLBACK_OPENAI_MODEL;
}

function fallbackModelForTask(
  task: ListingRuntimeTask,
  provider: "anthropic" | "openai"
): string {
  if (provider === "anthropic") {
    return task === "imageAnalysis" ? FALLBACK_IMAGE_MODEL : FALLBACK_ANTHROPIC_MODEL;
  }

  return FALLBACK_OPENAI_MODEL;
}

function hasAnthropicRuntime(): boolean {
  return Boolean(
    readNonEmptyEnv("ANTHROPIC_API_KEY") ||
      readNonEmptyEnv("ANTHROPIC_AUTH_TOKEN") ||
      readNonEmptyEnv("ANTHROPIC_MODEL")
  );
}

function hasOpenAiLikeRuntime(): boolean {
  return Boolean(
    readNonEmptyEnv("OPENAI_API_KEY") ||
      readNonEmptyEnv("OPENAI_MODEL") ||
      readNonEmptyEnv("GEMINI_API_KEY") ||
      readNonEmptyEnv("GEMINI_MODEL")
  );
}

function readProvider(value: string | undefined): "anthropic" | "openai" | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "anthropic" || normalized === "openai") {
    return normalized;
  }
  return null;
}

function readNonEmptyEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}
