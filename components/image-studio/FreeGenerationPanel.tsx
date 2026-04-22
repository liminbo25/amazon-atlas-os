"use client";

/* eslint-disable @next/next/no-img-element */

import { useState } from "react";

import MultiImageUploader from "@/components/image-studio/MultiImageUploader";

type FreeGenerationMode = "text-to-image" | "image-to-image";
type FreeGenerationStatus = "processing" | "success" | "error";
type FreeGenerationModelValue = "nano_banana_pro" | "image2";

export interface FreeGenerationModelOption {
  value: FreeGenerationModelValue;
  label: string;
  description?: string;
  endpoint?: string;
}

export interface FreeGenerationHistoryItem {
  id: string;
  prompt: string;
  mode: FreeGenerationMode;
  model: FreeGenerationModelValue;
  modelLabel: string;
  referenceImages: string[];
  result?: string;
  status: FreeGenerationStatus;
  error?: string | null;
  createdAt: number;
  updatedAt: number;
}

interface FreeGenerationPanelProps {
  selectedModel: FreeGenerationModelValue;
  onModelChange: (model: FreeGenerationModelValue) => void;
  modelOptions: FreeGenerationModelOption[];
  onPreview?: (src: string, title: string) => void;
  onDownload?: (src: string, filename: string) => void | Promise<void>;
  disabled?: boolean;
}

interface GeminiResponse {
  success?: boolean;
  result?: string;
  error?: string;
}

const MODE_OPTIONS: Array<{
  value: FreeGenerationMode;
  label: string;
  eyebrow: string;
  description: string;
}> = [
  {
    value: "text-to-image",
    label: "Text to image",
    eyebrow: "Prompt only",
    description: "Generate a fresh concept from a single prompt.",
  },
  {
    value: "image-to-image",
    label: "Image to image",
    eyebrow: "Prompt + reference",
    description: "Upload one reference image and steer the output with your prompt.",
  },
];

const MODEL_SIZE_BY_VALUE: Record<FreeGenerationModelValue, string> = {
  nano_banana_pro: "1024x1024",
  image2: "1024x1792",
};

const HISTORY_LIMIT = 8;

function createHistoryId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeClientError(error: unknown, fallbackMessage: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallbackMessage;
}

function getModelSize(model: FreeGenerationModelValue) {
  return MODEL_SIZE_BY_VALUE[model] || "1024x1024";
}

function formatTimestamp(timestamp: number) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

function truncatePrompt(prompt: string, maxLength = 120) {
  if (prompt.length <= maxLength) {
    return prompt;
  }

  return `${prompt.slice(0, maxLength - 1)}...`;
}

function buildDownloadName(item: FreeGenerationHistoryItem) {
  const extension = item.result?.startsWith("data:image/webp")
    ? "webp"
    : item.result?.startsWith("data:image/jpeg")
      ? "jpg"
      : "png";

  return `image-studio-free-generation-${item.mode}-${item.id}.${extension}`;
}

async function fallbackDownload(src: string, filename: string) {
  try {
    const response = await fetch(src);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(objectUrl);
    return;
  } catch {
    const link = document.createElement("a");
    link.href = src;
    link.download = filename;
    link.target = "_blank";
    link.rel = "noreferrer";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

export default function FreeGenerationPanel({
  selectedModel,
  onModelChange,
  modelOptions,
  onPreview,
  onDownload,
  disabled = false,
}: FreeGenerationPanelProps) {
  const [mode, setMode] = useState<FreeGenerationMode>("text-to-image");
  const [prompt, setPrompt] = useState("");
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [history, setHistory] = useState<FreeGenerationHistoryItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedModelOption =
    modelOptions.find((option) => option.value === selectedModel) || {
      value: selectedModel,
      label: selectedModel,
    };

  const latestResult = history[0];
  const canSubmit =
    !disabled &&
    !isSubmitting &&
    prompt.trim().length > 0 &&
    (mode === "text-to-image" || referenceImages.length > 0);

  async function handleGenerate() {
    const trimmedPrompt = prompt.trim();

    if (!trimmedPrompt) {
      setError("Enter a prompt before generating.");
      return;
    }

    if (mode === "image-to-image" && referenceImages.length === 0) {
      setError("Upload one reference image to use image-to-image mode.");
      return;
    }

    const nextItem: FreeGenerationHistoryItem = {
      id: createHistoryId(),
      prompt: trimmedPrompt,
      mode,
      model: selectedModel,
      modelLabel: selectedModelOption.label,
      referenceImages: [...referenceImages],
      status: "processing",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    setIsSubmitting(true);
    setError(null);
    setHistory((current) => [nextItem, ...current].slice(0, HISTORY_LIMIT));

    try {
      const response = await fetch("/api/gemini", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "free-generation",
          freeGenerationMode: mode,
          prompt: trimmedPrompt,
          model: selectedModel,
          size: getModelSize(selectedModel),
          referenceImages: mode === "image-to-image" ? referenceImages : [],
        }),
      });

      const payload = (await response.json()) as GeminiResponse;

      if (!response.ok || payload.success !== true || !payload.result) {
        throw new Error(payload.error || "Image generation failed.");
      }

      setHistory((current) =>
        current.map((item) =>
          item.id === nextItem.id
            ? {
                ...item,
                result: payload.result,
                status: "success",
                error: null,
                updatedAt: Date.now(),
              }
            : item
        )
      );
    } catch (generationError) {
      const message = normalizeClientError(
        generationError,
        "Image generation failed. Please retry."
      );

      setError(message);
      setHistory((current) =>
        current.map((item) =>
          item.id === nextItem.id
            ? {
                ...item,
                status: "error",
                error: message,
                updatedAt: Date.now(),
              }
            : item
        )
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function handlePreviewAction(item: FreeGenerationHistoryItem, target: "result" | "reference") {
    const src = target === "result" ? item.result : item.referenceImages[0];

    if (!src) {
      return;
    }

    const title =
      target === "result"
        ? `Free generation result ${formatTimestamp(item.createdAt)}`
        : `Free generation reference ${formatTimestamp(item.createdAt)}`;

    if (onPreview) {
      onPreview(src, title);
      return;
    }

    window.open(src, "_blank", "noopener,noreferrer");
  }

  async function handleDownloadAction(item: FreeGenerationHistoryItem) {
    if (!item.result) {
      return;
    }

    const filename = buildDownloadName(item);

    if (onDownload) {
      await onDownload(item.result, filename);
      return;
    }

    await fallbackDownload(item.result, filename);
  }

  function restoreHistoryItem(item: FreeGenerationHistoryItem) {
    setMode(item.mode);
    setPrompt(item.prompt);
    setReferenceImages(item.referenceImages);
    setError(null);
  }

  return (
    <section className="space-y-6">
      <article className="overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white/80 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="border-b border-slate-200 bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.18),_transparent_55%)] px-6 py-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                Free generation
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                Text-driven image creation
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Switch between prompt-only generation and prompt-guided reference generation,
                then keep the output in a reusable gallery with preview and download actions.
              </p>
            </div>

            <div className="rounded-[1.5rem] border border-slate-200 bg-white/90 px-4 py-3 text-sm leading-6 text-slate-600">
              <p className="font-semibold text-slate-950">Request contract</p>
              <p className="mt-1">
                Sends <code>type: &quot;free-generation&quot;</code> and
                <code> referenceImages</code> to <code>/api/gemini</code>.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 p-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <div className="space-y-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                Generation mode
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {MODE_OPTIONS.map((option) => {
                  const isActive = option.value === mode;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setMode(option.value);
                        setError(null);
                      }}
                      className={`rounded-[1.5rem] border px-5 py-5 text-left transition ${
                        isActive
                          ? "border-slate-950 bg-slate-950 text-white shadow-[0_18px_40px_rgba(15,23,42,0.18)]"
                          : "border-slate-200 bg-slate-50 text-slate-950 hover:border-slate-400 hover:bg-white"
                      }`}
                    >
                      <p
                        className={`text-[11px] font-semibold uppercase tracking-[0.2em] ${
                          isActive ? "text-white/65" : "text-slate-400"
                        }`}
                      >
                        {option.eyebrow}
                      </p>
                      <p className="mt-3 text-lg font-semibold">{option.label}</p>
                      <p className={`mt-2 text-sm leading-6 ${isActive ? "text-white/80" : "text-slate-500"}`}>
                        {option.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                  Model
                </p>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">
                  Active size {getModelSize(selectedModel)}
                </span>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {modelOptions.map((option) => {
                  const isActive = option.value === selectedModel;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => onModelChange(option.value)}
                      className={`rounded-[1.5rem] border px-5 py-5 text-left transition ${
                        isActive
                          ? "border-amber-300 bg-amber-50 shadow-[0_14px_30px_rgba(245,158,11,0.15)]"
                          : "border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-base font-semibold text-slate-950">{option.label}</p>
                        {isActive ? (
                          <span className="rounded-full bg-slate-950 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white">
                            Active
                          </span>
                        ) : null}
                      </div>
                      {option.description ? (
                        <p className="mt-3 text-sm leading-6 text-slate-500">{option.description}</p>
                      ) : null}
                      {option.endpoint ? (
                        <p className="mt-3 text-xs leading-5 text-slate-400">{option.endpoint}</p>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <label
                  htmlFor="free-generation-prompt"
                  className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400"
                >
                  Prompt
                </label>
                <span className="text-xs text-slate-400">{prompt.trim().length} chars</span>
              </div>

              <textarea
                id="free-generation-prompt"
                rows={7}
                value={prompt}
                onChange={(event) => {
                  setPrompt(event.target.value);
                  if (error) {
                    setError(null);
                  }
                }}
                placeholder="Describe the scene, product angle, lighting, mood, texture, framing, and any details that must remain stable."
                className="w-full rounded-[1.5rem] border border-slate-200 bg-slate-50 px-5 py-4 text-sm leading-7 text-slate-700 outline-none transition focus:border-slate-950 focus:bg-white"
              />

              <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-7 text-slate-600">
                Use direct, production-focused prompts. If the result must stay close to a source
                image, switch to image-to-image and upload one clean reference.
              </div>
            </div>

            {mode === "image-to-image" ? (
              <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50/70 p-4">
                <MultiImageUploader
                  images={referenceImages}
                  onImagesChange={(images) => {
                    setReferenceImages(images.slice(0, 1));
                    if (error) {
                      setError(null);
                    }
                  }}
                  maxImages={1}
                  uploadFolder="free-generation"
                  title="Reference image"
                  description="Upload one source image to guide composition, structure, or styling for the generated result."
                  renderImageFooter={() => (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-6 text-slate-500">
                      This image is sent as the first entry in <code>referenceImages</code>.
                    </div>
                  )}
                />
              </div>
            ) : null}

            {error ? (
              <div className="rounded-[1.5rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">
                {error}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void handleGenerate()}
                disabled={!canSubmit}
                className={`inline-flex min-w-40 items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition ${
                  canSubmit
                    ? "bg-slate-950 text-white hover:bg-slate-800"
                    : "cursor-not-allowed bg-slate-100 text-slate-400"
                }`}
              >
                {isSubmitting ? "Generating..." : "Generate image"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setPrompt("");
                  setReferenceImages([]);
                  setError(null);
                  setMode("text-to-image");
                }}
                disabled={isSubmitting}
                className={`inline-flex items-center justify-center rounded-full border px-5 py-3 text-sm font-semibold transition ${
                  isSubmitting
                    ? "cursor-not-allowed border-slate-200 text-slate-300"
                    : "border-slate-200 text-slate-700 hover:border-slate-400 hover:bg-slate-50"
                }`}
              >
                Reset inputs
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                    Latest result
                  </p>
                  <p className="mt-2 text-lg font-semibold text-slate-950">
                    {latestResult ? latestResult.modelLabel : "No generation yet"}
                  </p>
                </div>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-500">
                  {history.length} {history.length === 1 ? "item" : "items"}
                </span>
              </div>

              <div className="mt-4 overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white">
                {latestResult?.result ? (
                  <button
                    type="button"
                    onClick={() => handlePreviewAction(latestResult, "result")}
                    className="block w-full text-left transition hover:bg-slate-50"
                  >
                    <div className="aspect-[4/5] bg-slate-100">
                      <img
                        src={latestResult.result}
                        alt="Latest free generation result"
                        className="h-full w-full object-cover"
                      />
                    </div>
                  </button>
                ) : (
                  <div className="flex aspect-[4/5] items-center justify-center px-6 text-center">
                    <div>
                      <p className="text-base font-semibold text-slate-900">
                        {latestResult?.status === "processing"
                          ? "Generation in progress"
                          : "Your next result lands here"}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-500">
                        {latestResult?.status === "processing"
                          ? "The gallery updates automatically when the request completes."
                          : "Submit a prompt to start building a reusable result history."}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {latestResult ? (
                <div className="mt-4 space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-slate-950 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
                      {latestResult.mode}
                    </span>
                    <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      {latestResult.modelLabel}
                    </span>
                    <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      {latestResult.status}
                    </span>
                  </div>

                  <p className="text-sm leading-7 text-slate-600">
                    {truncatePrompt(latestResult.prompt, 180)}
                  </p>

                  {latestResult.error ? (
                    <div className="rounded-[1.25rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">
                      {latestResult.error}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-3">
                    {latestResult.result ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handlePreviewAction(latestResult, "result")}
                          className="inline-flex items-center justify-center rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                        >
                          Preview result
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDownloadAction(latestResult)}
                          className="inline-flex items-center justify-center rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-white"
                        >
                          Download result
                        </button>
                      </>
                    ) : null}

                    {latestResult.referenceImages[0] ? (
                      <button
                        type="button"
                        onClick={() => handlePreviewAction(latestResult, "reference")}
                        className="inline-flex items-center justify-center rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-white"
                      >
                        Preview reference
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="rounded-[1.75rem] border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                    Result history
                  </p>
                  <p className="mt-2 text-lg font-semibold text-slate-950">
                    Reuse prompts and compare outputs
                  </p>
                </div>
              </div>

              {history.length === 0 ? (
                <div className="mt-4 rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center">
                  <p className="text-base font-semibold text-slate-900">No history yet</p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    Each generation is saved here with its prompt, model, and actions.
                  </p>
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {history.map((item) => (
                    <article
                      key={item.id}
                      className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-4"
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                              {item.mode}
                            </span>
                            <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                              {item.modelLabel}
                            </span>
                            <span
                              className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                                item.status === "success"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : item.status === "error"
                                    ? "bg-rose-100 text-rose-700"
                                    : "bg-amber-100 text-amber-700"
                              }`}
                            >
                              {item.status}
                            </span>
                            <span className="text-xs text-slate-400">
                              {formatTimestamp(item.createdAt)}
                            </span>
                          </div>

                          <p className="mt-3 text-sm leading-7 text-slate-600">
                            {truncatePrompt(item.prompt)}
                          </p>

                          {item.error ? (
                            <p className="mt-3 rounded-[1.25rem] border border-rose-200 bg-rose-50 px-3 py-2 text-sm leading-6 text-rose-700">
                              {item.error}
                            </p>
                          ) : null}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => restoreHistoryItem(item)}
                            className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                          >
                            Reuse settings
                          </button>

                          {item.result ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handlePreviewAction(item, "result")}
                                className="inline-flex items-center justify-center rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                              >
                                Preview
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDownloadAction(item)}
                                className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                              >
                                Download
                              </button>
                            </>
                          ) : null}
                        </div>
                      </div>

                      {(item.referenceImages[0] || item.result) ? (
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          {item.referenceImages[0] ? (
                            <button
                              type="button"
                              onClick={() => handlePreviewAction(item, "reference")}
                              className="overflow-hidden rounded-[1.25rem] border border-slate-200 bg-white text-left transition hover:border-slate-400"
                            >
                              <div className="aspect-[4/5] bg-slate-100">
                                <img
                                  src={item.referenceImages[0]}
                                  alt="Free generation reference"
                                  className="h-full w-full object-cover"
                                />
                              </div>
                              <div className="px-4 py-3">
                                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                                  Reference
                                </p>
                              </div>
                            </button>
                          ) : (
                            <div className="flex aspect-[4/5] items-center justify-center rounded-[1.25rem] border border-dashed border-slate-200 bg-white px-4 text-center">
                              <div>
                                <p className="text-sm font-semibold text-slate-900">
                                  Prompt-only request
                                </p>
                                <p className="mt-2 text-sm leading-6 text-slate-500">
                                  This history item did not use a reference image.
                                </p>
                              </div>
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() => item.result && handlePreviewAction(item, "result")}
                            disabled={!item.result}
                            className={`overflow-hidden rounded-[1.25rem] border text-left transition ${
                              item.result
                                ? "border-slate-200 bg-white hover:border-slate-400"
                                : "cursor-not-allowed border-dashed border-slate-200 bg-white"
                            }`}
                          >
                            {item.result ? (
                              <>
                                <div className="aspect-[4/5] bg-slate-100">
                                  <img
                                    src={item.result}
                                    alt="Free generation result"
                                    className="h-full w-full object-cover"
                                  />
                                </div>
                                <div className="px-4 py-3">
                                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                                    Result
                                  </p>
                                </div>
                              </>
                            ) : (
                              <div className="flex aspect-[4/5] items-center justify-center px-4 text-center">
                                <div>
                                  <p className="text-sm font-semibold text-slate-900">
                                    {item.status === "processing"
                                      ? "Waiting for output"
                                      : "No output saved"}
                                  </p>
                                  <p className="mt-2 text-sm leading-6 text-slate-500">
                                    {item.status === "processing"
                                      ? "The result tile fills in after the request returns."
                                      : "This run did not return a downloadable image."}
                                  </p>
                                </div>
                              </div>
                            )}
                          </button>
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </article>
    </section>
  );
}
