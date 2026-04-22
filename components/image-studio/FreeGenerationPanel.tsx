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
    label: "文生图",
    eyebrow: "仅输入提示词",
    description: "直接生成新画面，适合概念图、商品氛围图和快速试稿。",
  },
  {
    value: "image-to-image",
    label: "图生图",
    eyebrow: "提示词 + 参考图",
    description: "上传 1 张参考图，保留结构方向，再用提示词控制风格和细节。",
  },
];

const MODE_LABEL: Record<FreeGenerationMode, string> = {
  "text-to-image": "文生图",
  "image-to-image": "图生图",
};

const STATUS_META: Record<
  FreeGenerationStatus,
  { label: string; className: string; emptyLabel: string; emptyDescription: string }
> = {
  processing: {
    label: "生成中",
    className: "bg-amber-100 text-amber-700",
    emptyLabel: "正在排队生成",
    emptyDescription: "结果返回后会自动更新到这里。",
  },
  success: {
    label: "已完成",
    className: "bg-emerald-100 text-emerald-700",
    emptyLabel: "已完成",
    emptyDescription: "这次任务已经生成可预览、可下载的结果。",
  },
  error: {
    label: "失败",
    className: "bg-rose-100 text-rose-700",
    emptyLabel: "本次未返回结果",
    emptyDescription: "可以复用参数后重新生成。",
  },
};

const MODEL_SIZE_BY_VALUE: Record<FreeGenerationModelValue, string> = {
  nano_banana_pro: "1024x1024",
  image2: "1024x1792",
};

const PROMPT_HINTS = ["主体要清楚", "场景别太泛", "光线/镜头可写", "商品图建议写材质和角度"];

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
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
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
  const activeModeOption = MODE_OPTIONS.find((option) => option.value === mode) || MODE_OPTIONS[0];
  const latestResult = history[0];
  const canSubmit =
    !disabled &&
    !isSubmitting &&
    prompt.trim().length > 0 &&
    (mode === "text-to-image" || referenceImages.length > 0);

  async function handleGenerate() {
    const trimmedPrompt = prompt.trim();

    if (!trimmedPrompt) {
      setError("请先输入提示词，再开始生成。");
      return;
    }

    if (mode === "image-to-image" && referenceImages.length === 0) {
      setError("图生图模式需要先上传 1 张参考图。");
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
        throw new Error(payload.error || "生成失败，请稍后重试。");
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
      const message = normalizeClientError(generationError, "生成失败，请稍后重试。");

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
        ? `自由生图结果 ${formatTimestamp(item.createdAt)}`
        : `自由生图参考图 ${formatTimestamp(item.createdAt)}`;

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
    <section className="space-y-4">
      <article className="overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white/90 shadow-[0_18px_48px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="border-b border-slate-200 bg-[linear-gradient(135deg,rgba(249,115,22,0.12),rgba(15,23,42,0.02)_55%,rgba(255,255,255,0.88))] px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                自由生图
              </p>
              <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-2xl">
                更短、更快的文生图 / 图生图工作台
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                适合嵌入式入口页使用。保留模型切换、参考图生成、结果历史、预览和下载，首屏尽量压缩到一次看完。
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-[1.25rem] border border-white/70 bg-white/90 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  当前模式
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-950">{activeModeOption.label}</p>
              </div>
              <div className="rounded-[1.25rem] border border-white/70 bg-white/90 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  输出尺寸
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-950">
                  {getModelSize(selectedModel)}
                </p>
              </div>
              <div className="rounded-[1.25rem] border border-white/70 bg-white/90 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  历史记录
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-950">最多 {HISTORY_LIMIT} 条</p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4 p-5 sm:p-6">
          <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)] sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                      提示词与参考图
                    </p>
                    <p className="mt-2 text-sm text-slate-600">
                      先把主体、场景、光线、构图和质感写清楚。图生图时，参考图也放在这里一起处理。
                    </p>
                  </div>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">
                    {prompt.trim().length} 字
                  </span>
                </div>

                <textarea
                  id="free-generation-prompt"
                  rows={5}
                  value={prompt}
                  onChange={(event) => {
                    setPrompt(event.target.value);
                    if (error) {
                      setError(null);
                    }
                  }}
                  placeholder="例：白底棚拍的保温杯主图，金属拉丝质感，45 度侧前方视角，柔和高光，杯身细节清晰，画面干净，高级电商视觉。"
                  className="mt-4 w-full rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-7 text-slate-700 outline-none transition focus:border-slate-950 focus:bg-white"
                />

                <div className="mt-3 flex flex-wrap gap-2">
                  {PROMPT_HINTS.map((hint) => (
                    <span
                      key={hint}
                      className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600"
                    >
                      {hint}
                    </span>
                  ))}
                </div>

                {mode === "image-to-image" ? (
                  <div className="mt-4 rounded-[1.25rem] border border-slate-200 bg-slate-50/70 p-4">
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
                      title="参考图"
                      description="仅保留 1 张参考图，用来约束结构、主体或风格方向。"
                      renderImageFooter={() => (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-6 text-slate-500">
                          该图片会作为 <code>referenceImages</code> 的首项发送。
                        </div>
                      )}
                    />
                  </div>
                ) : (
                  <div className="mt-4 rounded-[1.25rem] border border-dashed border-slate-200 bg-slate-50/70 px-4 py-3 text-sm leading-6 text-slate-600">
                    当前是文生图模式，不需要上传参考图。
                  </div>
                )}

                {error ? (
                  <div className="mt-4 rounded-[1.25rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">
                    {error}
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void handleGenerate()}
                    disabled={!canSubmit}
                    className={`inline-flex min-w-36 items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition ${
                      canSubmit
                        ? "bg-slate-950 text-white hover:bg-slate-800"
                        : "cursor-not-allowed bg-slate-100 text-slate-400"
                    }`}
                  >
                    {isSubmitting ? "生成中..." : "开始生成"}
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
                    清空重填
                  </button>

                  <p className="text-xs leading-6 text-slate-500">
                    {mode === "image-to-image"
                      ? "图生图会发送提示词和参考图。"
                      : "文生图只发送提示词和模型配置。"}
                  </p>
                </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
            <div className="space-y-4">
                <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                        生成模式
                      </p>
                      <p className="mt-2 text-sm text-slate-600">{activeModeOption.description}</p>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
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
                          className={`rounded-[1.25rem] border px-4 py-3 text-left transition ${
                            isActive
                              ? "border-slate-950 bg-slate-950 text-white shadow-[0_14px_30px_rgba(15,23,42,0.16)]"
                              : "border-slate-200 bg-slate-50 text-slate-950 hover:border-slate-400 hover:bg-white"
                          }`}
                        >
                          <p
                            className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${
                              isActive ? "text-white/65" : "text-slate-400"
                            }`}
                          >
                            {option.eyebrow}
                          </p>
                          <p className="mt-2 text-sm font-semibold">{option.label}</p>
                          <p
                            className={`mt-1 text-xs leading-5 ${
                              isActive ? "text-white/80" : "text-slate-500"
                            }`}
                          >
                            {option.description}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                        模型切换
                      </p>
                      <p className="mt-2 text-sm text-slate-600">
                        当前输出尺寸 {getModelSize(selectedModel)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 space-y-2.5">
                    {modelOptions.map((option) => {
                      const isActive = option.value === selectedModel;

                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => onModelChange(option.value)}
                          className={`w-full rounded-[1.25rem] border px-4 py-3 text-left transition ${
                            isActive
                              ? "border-amber-300 bg-amber-50 shadow-[0_12px_24px_rgba(245,158,11,0.14)]"
                              : "border-slate-200 bg-slate-50 hover:border-slate-400 hover:bg-white"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-950">{option.label}</p>
                              {option.description ? (
                                <p className="mt-1 text-xs leading-5 text-slate-500">
                                  {option.description}
                                </p>
                              ) : null}
                            </div>
                            {isActive ? (
                              <span className="rounded-full bg-slate-950 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white">
                                当前
                              </span>
                            ) : null}
                          </div>

                          {option.endpoint ? (
                            <p className="mt-2 truncate text-[11px] leading-5 text-slate-400">
                              {option.endpoint}
                            </p>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

          <div className="space-y-4">
            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                    最新结果
                  </p>
                  <p className="mt-2 text-lg font-semibold text-slate-950">
                    {latestResult ? latestResult.modelLabel : "等待第一次生成"}
                  </p>
                </div>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-500">
                  {history.length} 条
                </span>
              </div>

              <div className="mt-4 overflow-hidden rounded-[1.25rem] border border-slate-200 bg-white">
                {latestResult?.result ? (
                  <button
                    type="button"
                    onClick={() => handlePreviewAction(latestResult, "result")}
                    className="block w-full text-left transition hover:bg-slate-50"
                  >
                    <div className="aspect-[4/3] bg-slate-100">
                      <img
                        src={latestResult.result}
                        alt="最新自由生图结果"
                        className="h-full w-full object-cover"
                      />
                    </div>
                  </button>
                ) : (
                  <div className="flex aspect-[4/3] items-center justify-center px-6 text-center">
                    <div>
                      <p className="text-base font-semibold text-slate-900">
                        {latestResult
                          ? STATUS_META[latestResult.status].emptyLabel
                          : "你的下一张结果会显示在这里"}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-500">
                        {latestResult
                          ? STATUS_META[latestResult.status].emptyDescription
                          : "输入提示词后发起生成，这里会自动沉淀最近结果。"}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {latestResult ? (
                <div className="mt-4 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-slate-950 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white">
                      {MODE_LABEL[latestResult.mode]}
                    </span>
                    <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-500">
                      {latestResult.modelLabel}
                    </span>
                    <span
                      className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                        STATUS_META[latestResult.status].className
                      }`}
                    >
                      {STATUS_META[latestResult.status].label}
                    </span>
                  </div>

                  <p className="text-sm leading-6 text-slate-600">
                    {truncatePrompt(latestResult.prompt, 120)}
                  </p>

                  {latestResult.error ? (
                    <div className="rounded-[1.25rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">
                      {latestResult.error}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-2.5">
                    {latestResult.result ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handlePreviewAction(latestResult, "result")}
                          className="inline-flex items-center justify-center rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                        >
                          预览结果
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDownloadAction(latestResult)}
                          className="inline-flex items-center justify-center rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-white"
                        >
                          下载图片
                        </button>
                      </>
                    ) : null}

                    {latestResult.referenceImages[0] ? (
                      <button
                        type="button"
                        onClick={() => handlePreviewAction(latestResult, "reference")}
                        className="inline-flex items-center justify-center rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-white"
                      >
                        查看参考图
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                    结果历史
                  </p>
                  <p className="mt-2 text-sm text-slate-600">复用提示词、参数和参考图，快速回放。</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
                  最近 {history.length}/{HISTORY_LIMIT}
                </span>
              </div>

              {history.length === 0 ? (
                <div className="mt-4 rounded-[1.25rem] border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center">
                  <p className="text-base font-semibold text-slate-900">还没有历史记录</p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    每次生成都会保留模式、模型、参考图和结果操作。
                  </p>
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {history.map((item) => (
                    <article
                      key={item.id}
                      className="rounded-[1.25rem] border border-slate-200 bg-slate-50/80 p-3"
                    >
                      <div className="grid gap-3 sm:grid-cols-[96px_minmax(0,1fr)]">
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-1">
                          {item.referenceImages[0] ? (
                            <button
                              type="button"
                              onClick={() => handlePreviewAction(item, "reference")}
                              className="overflow-hidden rounded-[1rem] border border-slate-200 bg-white transition hover:border-slate-400"
                            >
                              <div className="aspect-square bg-slate-100">
                                <img
                                  src={item.referenceImages[0]}
                                  alt="历史参考图"
                                  className="h-full w-full object-cover"
                                />
                              </div>
                            </button>
                          ) : (
                            <div className="flex aspect-square items-center justify-center rounded-[1rem] border border-dashed border-slate-200 bg-white px-2 text-center text-[11px] font-medium text-slate-400">
                              无参考图
                            </div>
                          )}

                          {item.result ? (
                            <button
                              type="button"
                              onClick={() => handlePreviewAction(item, "result")}
                              className="overflow-hidden rounded-[1rem] border border-slate-200 bg-white transition hover:border-slate-400"
                            >
                              <div className="aspect-square bg-slate-100">
                                <img
                                  src={item.result}
                                  alt="历史生成结果"
                                  className="h-full w-full object-cover"
                                />
                              </div>
                            </button>
                          ) : (
                            <div className="flex aspect-square items-center justify-center rounded-[1rem] border border-dashed border-slate-200 bg-white px-2 text-center text-[11px] font-medium text-slate-400">
                              {STATUS_META[item.status].label}
                            </div>
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-500">
                              {MODE_LABEL[item.mode]}
                            </span>
                            <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-500">
                              {item.modelLabel}
                            </span>
                            <span
                              className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                                STATUS_META[item.status].className
                              }`}
                            >
                              {STATUS_META[item.status].label}
                            </span>
                            <span className="text-xs text-slate-400">
                              {formatTimestamp(item.createdAt)}
                            </span>
                          </div>

                          <p className="mt-3 text-sm leading-6 text-slate-600">
                            {truncatePrompt(item.prompt, 88)}
                          </p>

                          {item.error ? (
                            <p className="mt-3 rounded-[1rem] border border-rose-200 bg-rose-50 px-3 py-2 text-sm leading-6 text-rose-700">
                              {item.error}
                            </p>
                          ) : null}

                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => restoreHistoryItem(item)}
                              className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                            >
                              复用参数
                            </button>

                            {item.referenceImages[0] ? (
                              <button
                                type="button"
                                onClick={() => handlePreviewAction(item, "reference")}
                                className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                              >
                                看参考图
                              </button>
                            ) : null}

                            {item.result ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handlePreviewAction(item, "result")}
                                  className="inline-flex items-center justify-center rounded-full bg-slate-950 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                                >
                                  预览
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleDownloadAction(item)}
                                  className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                                >
                                  下载
                                </button>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </div>
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
