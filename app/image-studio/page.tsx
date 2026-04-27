"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import FreeGenerationPanel from "@/components/image-studio/FreeGenerationPanel";
import MultiImageUploader from "@/components/image-studio/MultiImageUploader";
import { StudioHeader } from "@/components/portal/studio-header";
import {
  TRY_ON_GARMENT_SCOPE_OPTIONS,
  type TryOnGarmentScope,
} from "@/lib/tryon-scope";
import {
  getAspectRatio,
  getCanvasDimensionsForAspect,
  getClosestTryOnSizeForAspect,
  type ImageDimensions,
} from "@/lib/tryon-aspect";

type AsyncStatus = "idle" | "processing" | "success" | "error";
type GeminiImageModel = "nano_banana_pro" | "image2";
type TryOnEngine = "fashn" | GeminiImageModel;
type TryOnProviderStatus =
  | "starting"
  | "in_queue"
  | "processing"
  | "completed"
  | "failed";
type GenerationMode =
  | "multi-clothing-single-model"
  | "single-clothing-multi-model"
  | "all-combinations";
type StudioWorkspace = "overview" | "try-on" | "free" | "post" | "results";
type UpscaleMode = "target" | "factor";
type UpscaleOutputFormat = "jpg" | "png" | "webp";

interface GenerationModeOption {
  title: string;
  shortTitle: string;
  description: string;
  clothingMaxImages: number;
  modelMaxImages: number;
  clothingTitle: string;
  clothingDescription: string;
  modelTitle: string;
  modelDescription: string;
  relationshipSummary: string;
}

interface GeminiImageModelOption {
  value: GeminiImageModel;
  label: string;
  description: string;
  endpoint: string;
}

interface TryOnEngineOption {
  value: TryOnEngine;
  label: string;
  description: string;
  endpoint: string;
  summary?: string;
  requiresFashn?: boolean;
}

interface ImageTaskState {
  status: AsyncStatus;
  image?: string;
  error: string | null;
  retryCount: number;
  format?: string;
  detail?: string | null;
}

interface ImageGenerationTask {
  id: string;
  mode: GenerationMode;
  clothingIndex: number;
  clothingTotal: number;
  modelIndex: number;
  modelTotal: number;
  clothingImage: string;
  modelImage: string;
  garmentNote: string;
  garmentScope: TryOnGarmentScope;
  tryOn: ImageTaskState;
  whiteBackground: ImageTaskState;
  enhanced: ImageTaskState;
}

interface StandaloneImageItem {
  source: string;
  whiteBackground: ImageTaskState;
  enhanced: ImageTaskState;
}

interface ImageApiResponse {
  success?: boolean;
  result?: string;
  error?: string;
  configured?: boolean;
  provider?: string;
  fallbackProvider?: string;
  jobId?: string;
  status?: string;
  model?: string;
  generationMode?: string;
  resolution?: string;
  outputFormat?: string;
}

interface UpscaleSettings {
  upscaleMode: UpscaleMode;
  target: number;
  factor: number;
  enhanceDetails: boolean;
  enhanceRealism: boolean;
  outputFormat: UpscaleOutputFormat;
  outputQuality: number;
}

interface PreviewState {
  src: string;
  title: string;
}

interface PreviewTileProps {
  title: string;
  image?: string;
  alt: string;
  status?: AsyncStatus;
  emptyTitle: string;
  emptyDescription: string;
  description?: string;
  error?: string | null;
  backgroundClassName?: string;
  onPreview?: () => void;
}

const generationModeOrder: GenerationMode[] = [
  "multi-clothing-single-model",
  "single-clothing-multi-model",
  "all-combinations",
];

const generationModeOptions: Record<GenerationMode, GenerationModeOption> = {
  "multi-clothing-single-model": {
    title: "多张服装图 -> 一个模特图",
    shortTitle: "多服装单模特",
    description: "适合固定一位模特，批量试穿多套服装。",
    clothingMaxImages: 10,
    modelMaxImages: 1,
    clothingTitle: "服装图上传",
    clothingDescription:
      "上传多张服装图。每张图都可以填写独立服装备注，生成时会分别提交。",
    modelTitle: "固定模特图",
    modelDescription: "上传 1 张模特图，这一批所有服装都会复用这张模特图。",
    relationshipSummary: "每张服装图都会和同一张模特图配对生成。",
  },
  "single-clothing-multi-model": {
    title: "一张服装图 -> 多个模特图",
    shortTitle: "单服装多模特",
    description: "适合固定一套服装，快速测试不同模特表现。",
    clothingMaxImages: 1,
    modelMaxImages: 10,
    clothingTitle: "固定服装图",
    clothingDescription:
      "上传 1 张服装图。这张服装会应用到当前批次的所有模特图上。",
    modelTitle: "模特图上传",
    modelDescription: "上传多张模特图，同一套服装会分别套到每位模特上。",
    relationshipSummary: "同一张服装图会和每张模特图逐一配对生成。",
  },
  "all-combinations": {
    title: "多张服装图 × 多个模特图 全组合生成",
    shortTitle: "全组合",
    description: "适合一次性跑完整组合矩阵，不漏任何服装和模特配对。",
    clothingMaxImages: 10,
    modelMaxImages: 10,
    clothingTitle: "服装图上传",
    clothingDescription:
      "上传多张服装图。每张服装图都可以保留自己的服装备注。",
    modelTitle: "模特图上传",
    modelDescription:
      "上传多张模特图。系统会让每张服装图与每张模特图全部组合生成。",
    relationshipSummary: "每张服装图会和每张模特图全部交叉组合生成。",
  },
};

const quickNotes = [
  "生成前先选模式，上传区限制和任务数量会跟着变化。",
  "服装备注仍然保留，适合补充领口、袖长、露肤范围等不要改动的细节。",
  "结果卡片会固定记录当前模式、服装索引、模特索引，单张重试不会串组。",
  "白底图与增强图仍然独立保存，可单张处理，也可对整批成功结果继续处理。",
];

const formatOptions: UpscaleOutputFormat[] = ["jpg", "png", "webp"];
const TRY_ON_RESULT_ASPECT_TOLERANCE = 0.01;
const geminiImageModelOptions: GeminiImageModelOption[] = [
  {
    value: "nano_banana_pro",
    label: "Nano Banana Pro",
    description:
      "使用 /v1/images/generations，当前更稳的 Gemini 回退路径，适合批量任务。",
    endpoint: "https://ai.yijiarj.cn/v1/images/generations",
  },
  {
    value: "image2",
    label: "Image2",
    description:
      "使用 /v1/chat/completions，细节潜力更高，但回包格式和稳定性波动也更大。",
    endpoint: "https://api.yijiarj.cn/v1/chat/completions",
  },
];
const tryOnEngineOptions: TryOnEngineOption[] = [
  {
    value: "fashn",
    label: "FASHN Try-On Max",
    description:
      "使用专用换装后端，人物一致性更稳，适合把换装当主链路时直接使用。",
    endpoint: "https://api.fashn.ai/v1/run",
    summary: "tryon-max / quality / 2k / png",
    requiresFashn: true,
  },
  ...geminiImageModelOptions,
];

let taskSequence = 0;
const FASHN_POLL_INTERVAL_MS = 2500;
const FASHN_MAX_POLL_ATTEMPTS = 90;
const CLIENT_FETCH_MAX_ATTEMPTS = 3;

function createTaskState(overrides: Partial<ImageTaskState> = {}): ImageTaskState {
  return {
    status: "idle",
    error: null,
    retryCount: 0,
    detail: null,
    ...overrides,
  };
}

function createTaskId(mode: GenerationMode, clothingIndex: number, modelIndex: number) {
  taskSequence += 1;
  return `${mode}-${clothingIndex}-${modelIndex}-${taskSequence}`;
}

function createProcessedTask(input: {
  mode: GenerationMode;
  clothingIndex: number;
  clothingTotal: number;
  modelIndex: number;
  modelTotal: number;
  clothingImage: string;
  modelImage: string;
  garmentNote: string;
  garmentScope: TryOnGarmentScope;
}): ImageGenerationTask {
  return {
    id: createTaskId(input.mode, input.clothingIndex, input.modelIndex),
    mode: input.mode,
    clothingIndex: input.clothingIndex,
    clothingTotal: input.clothingTotal,
    modelIndex: input.modelIndex,
    modelTotal: input.modelTotal,
    clothingImage: input.clothingImage,
    modelImage: input.modelImage,
    garmentNote: input.garmentNote,
    garmentScope: input.garmentScope,
    tryOn: createTaskState(),
    whiteBackground: createTaskState(),
    enhanced: createTaskState(),
  };
}

function createStandaloneItem(source: string): StandaloneImageItem {
  return {
    source,
    whiteBackground: createTaskState(),
    enhanced: createTaskState(),
  };
}

function isValidImageSource(value?: string) {
  if (!value) {
    return false;
  }

  return (
    value.startsWith("data:image/") ||
    value.startsWith("http://") ||
    value.startsWith("https://")
  );
}

function formatFactor(value: number) {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
}

function describeUpscaleSettings(settings: UpscaleSettings) {
  const scaleLabel =
    settings.upscaleMode === "target"
      ? `目标分辨率 ${settings.target} MP`
      : `放大倍数 ${formatFactor(settings.factor)}x`;
  const enhancements = [
    settings.enhanceDetails ? "细节增强" : null,
    settings.enhanceRealism ? "真实感增强" : null,
  ]
    .filter(Boolean)
    .join(" / ");

  return `${scaleLabel} / ${settings.outputFormat.toUpperCase()} / 质量 ${
    settings.outputQuality
  }${enhancements ? ` / ${enhancements}` : ""}`;
}

function sleep(delayMs: number) {
  return new Promise((resolve) => window.setTimeout(resolve, delayMs));
}

function isRetryableClientFetchError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const normalizedMessage = error.message.trim().toLowerCase();

  return (
    normalizedMessage === "failed to fetch" ||
    normalizedMessage === "networkerror when attempting to fetch resource." ||
    error.name === "TypeError"
  );
}

async function fetchWithRetry(
  input: string,
  init?: RequestInit,
  maxAttempts = CLIENT_FETCH_MAX_ATTEMPTS
) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fetch(input, init);
    } catch (error) {
      lastError = error;

      if (!isRetryableClientFetchError(error) || attempt >= maxAttempts) {
        throw error;
      }

      await sleep(350 * attempt);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Failed to fetch after retries.");
}

function inferImageFormatFromSource(source?: string) {
  if (!source) {
    return undefined;
  }

  const normalized = source.toLowerCase();

  if (normalized.startsWith("data:image/")) {
    const mediaType = normalized.slice("data:image/".length).split(/[;,]/)[0];
    return mediaType || undefined;
  }

  const withoutQuery = normalized.split("?")[0]?.split("#")[0] || normalized;

  if (withoutQuery.endsWith(".png")) {
    return "png";
  }

  if (withoutQuery.endsWith(".webp")) {
    return "webp";
  }

  if (withoutQuery.endsWith(".jpeg")) {
    return "jpeg";
  }

  if (withoutQuery.endsWith(".jpg")) {
    return "jpg";
  }

  return undefined;
}

function normalizeDownloadExtension(format?: string) {
  if (!format) {
    return "png";
  }

  return format === "jpeg" ? "jpg" : format;
}

function describeTryOnProviderStatus(status?: string) {
  switch (status as TryOnProviderStatus) {
    case "starting":
      return "FASHN 已接收任务，正在准备排队。";
    case "in_queue":
      return "FASHN 队列中，正在等待开始生成。";
    case "processing":
      return "FASHN 正在生成换装结果，请稍候。";
    case "completed":
      return "FASHN 已完成，正在同步结果。";
    case "failed":
      return "FASHN 任务失败。";
    default:
      return "正在处理换装任务。";
  }
}

function normalizeClientError(error: unknown, fallback: string) {
  if (error instanceof Error) {
    if (error.message === "Failed to fetch") {
      return "请求已发出，但浏览器在自动重试后仍没有拿到完整返回。请刷新后重试，或换一张更小的图片。";
    }

    return error.message;
  }

  return fallback;
}

function getStatusLabel(status: AsyncStatus) {
  switch (status) {
    case "processing":
      return "处理中";
    case "success":
      return "已完成";
    case "error":
      return "失败";
    case "idle":
    default:
      return "未开始";
  }
}

function getStatusPillClass(status: AsyncStatus) {
  switch (status) {
    case "processing":
      return "bg-amber-100 text-amber-700";
    case "success":
      return "bg-emerald-100 text-emerald-700";
    case "error":
      return "bg-rose-100 text-rose-700";
    case "idle":
    default:
      return "bg-slate-100 text-slate-500";
  }
}

function getWhiteBackgroundButtonLabel(task: ImageTaskState) {
  if (task.status === "processing") {
    return "换白底中...";
  }

  if (task.status === "error") {
    return "重试换白底";
  }

  return task.status === "success" ? "重新换白底" : "一键换白底";
}

function getEnhanceButtonLabel(task: ImageTaskState, canEnhance: boolean) {
  if (!canEnhance) {
    return "缺少 Token";
  }

  if (task.status === "processing") {
    return "变清晰中...";
  }

  if (task.status === "error") {
    return "重试变清晰";
  }

  return task.status === "success" ? "重新变清晰" : "一键变清晰";
}

function getGenerationModeLabel(mode: GenerationMode) {
  return generationModeOptions[mode].title;
}

function getGenerationModeShortLabel(mode: GenerationMode) {
  return generationModeOptions[mode].shortTitle;
}

function getTryOnGarmentScopeLabel(scope: TryOnGarmentScope) {
  return (
    TRY_ON_GARMENT_SCOPE_OPTIONS.find((option) => option.value === scope)
      ?.label || TRY_ON_GARMENT_SCOPE_OPTIONS[0].label
  );
}

function getPlannedTaskCount(
  mode: GenerationMode,
  clothingCount: number,
  modelCount: number
) {
  if (mode === "multi-clothing-single-model") {
    return clothingCount > 0 && modelCount > 0 ? clothingCount : 0;
  }

  if (mode === "single-clothing-multi-model") {
    return clothingCount > 0 && modelCount > 0 ? modelCount : 0;
  }

  return clothingCount > 0 && modelCount > 0 ? clothingCount * modelCount : 0;
}

function getEstimateMessage(
  mode: GenerationMode,
  clothingCount: number,
  modelCount: number
) {
  if (mode === "multi-clothing-single-model") {
    if (clothingCount === 0 && modelCount === 0) {
      return "先上传服装图和 1 张固定模特图。";
    }
    if (clothingCount === 0) {
      return "当前模式还缺服装图。";
    }
    if (modelCount === 0) {
      return "当前模式还缺固定模特图。";
    }

    return `当前会用 ${clothingCount} 张服装图匹配 1 张模特图，预计生成 ${clothingCount} 张结果。`;
  }

  if (mode === "single-clothing-multi-model") {
    if (clothingCount === 0 && modelCount === 0) {
      return "先上传 1 张固定服装图，再上传模特图。";
    }
    if (clothingCount === 0) {
      return "当前模式还缺固定服装图。";
    }
    if (modelCount === 0) {
      return "当前模式还缺模特图。";
    }

    return `当前会用 1 张服装图匹配 ${modelCount} 张模特图，预计生成 ${modelCount} 张结果。`;
  }

  if (clothingCount === 0 && modelCount === 0) {
    return "先上传服装图和模特图，系统会做全组合生成。";
  }
  if (clothingCount === 0) {
    return "当前模式还缺服装图。";
  }
  if (modelCount === 0) {
    return "当前模式还缺模特图。";
  }

  return `当前会让 ${clothingCount} 张服装图和 ${modelCount} 张模特图全部组合，预计生成 ${
    clothingCount * modelCount
  } 张结果。`;
}

function buildGenerationTasks(
  mode: GenerationMode,
  clothingImages: string[],
  modelImages: string[],
  garmentNotes: string[],
  garmentScope: TryOnGarmentScope
) {
  const clothingTotal = clothingImages.length;
  const modelTotal = modelImages.length;

  if (mode === "multi-clothing-single-model") {
    const fixedModel = modelImages[0];

    if (!fixedModel) {
      return [];
    }

    return clothingImages.map((clothingImage, clothingIndex) =>
      createProcessedTask({
        mode,
        clothingIndex,
        clothingTotal,
        modelIndex: 0,
        modelTotal,
        clothingImage,
        modelImage: fixedModel,
        garmentNote: garmentNotes[clothingIndex] ?? "",
        garmentScope,
      })
    );
  }

  if (mode === "single-clothing-multi-model") {
    const fixedClothing = clothingImages[0];

    if (!fixedClothing) {
      return [];
    }

    return modelImages.map((modelImage, modelIndex) =>
      createProcessedTask({
        mode,
        clothingIndex: 0,
        clothingTotal,
        modelIndex,
        modelTotal,
        clothingImage: fixedClothing,
        modelImage,
        garmentNote: garmentNotes[0] ?? "",
        garmentScope,
      })
    );
  }

  return clothingImages.flatMap((clothingImage, clothingIndex) =>
    modelImages.map((modelImage, modelIndex) =>
      createProcessedTask({
        mode,
        clothingIndex,
        clothingTotal,
        modelIndex,
        modelTotal,
        clothingImage,
        modelImage,
        garmentNote: garmentNotes[clothingIndex] ?? "",
        garmentScope,
      })
    )
  );
}

function buildTaskFilename(
  task: ImageGenerationTask,
  suffix: "try-on" | "white-background" | "enhanced",
  extension: string
) {
  return `image-studio-${task.mode}-${task.garmentScope}-c${task.clothingIndex + 1}-m${
    task.modelIndex + 1
  }-${suffix}.${extension}`;
}

function buildStandaloneFilename(
  index: number,
  suffix: "white-background" | "enhanced",
  extension: string
) {
  return `image-studio-standalone-${index + 1}-${suffix}.${extension}`;
}

function loadImageElement(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      if (!image.naturalWidth || !image.naturalHeight) {
        reject(new Error("图片尺寸读取失败。"));
        return;
      }

      resolve(image);
    };
    image.onerror = () => reject(new Error("图片加载失败，无法读取原比例。"));
    image.src = source;
  });
}

async function readImageDimensions(source: string): Promise<ImageDimensions> {
  const image = await loadImageElement(source);

  return {
    width: image.naturalWidth,
    height: image.naturalHeight,
  };
}

function getCoverDrawRect(
  imageDimensions: ImageDimensions,
  canvasDimensions: ImageDimensions
) {
  const imageRatio = getAspectRatio(imageDimensions);
  const canvasRatio = getAspectRatio(canvasDimensions);

  if (imageRatio > canvasRatio) {
    const height = canvasDimensions.height;
    const width = height * imageRatio;

    return {
      x: (canvasDimensions.width - width) / 2,
      y: 0,
      width,
      height,
    };
  }

  const width = canvasDimensions.width;
  const height = width / imageRatio;

  return {
    x: 0,
    y: (canvasDimensions.height - height) / 2,
    width,
    height,
  };
}

function PreviewTile({
  title,
  image,
  alt,
  status = "idle",
  emptyTitle,
  emptyDescription,
  description,
  error,
  backgroundClassName = "bg-white",
  onPreview,
}: PreviewTileProps) {
  if (image && isValidImageSource(image)) {
    return (
      <button
        type="button"
        onClick={onPreview}
        className={`${backgroundClassName} p-4 text-left transition hover:bg-slate-50`}
      >
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
          {title}
        </p>
        <div className="aspect-[4/5] overflow-hidden rounded-[1.25rem] bg-white">
          <img src={image} alt={alt} className="h-full w-full object-cover" />
        </div>
        {description ? (
          <p className="mt-3 text-sm leading-6 text-slate-500">{description}</p>
        ) : null}
      </button>
    );
  }

  const placeholderTitle =
    status === "processing"
      ? `${title}处理中`
      : status === "error"
        ? `${title}生成失败`
        : emptyTitle;
  const placeholderDescription =
    status === "processing" ? "请稍候，完成后会自动显示在这里。" : emptyDescription;

  return (
    <div className={`${backgroundClassName} p-4`}>
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
        {title}
      </p>
      <div className="flex aspect-[4/5] items-center justify-center rounded-[1.25rem] border border-dashed border-slate-300 bg-white px-5 text-center">
        <div>
          <p className="text-base font-semibold text-slate-900">{placeholderTitle}</p>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {placeholderDescription}
          </p>
        </div>
      </div>
      {description ? (
        <p className="mt-3 text-sm leading-6 text-slate-500">{description}</p>
      ) : null}
      {error ? (
        <p className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm leading-6 text-rose-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default function ImageStudioPage() {
  const [activeWorkspace, setActiveWorkspace] =
    useState<StudioWorkspace>("overview");
  const [generationMode, setGenerationMode] = useState<GenerationMode>(
    "multi-clothing-single-model"
  );
  const [clothingImages, setClothingImages] = useState<string[]>([]);
  const [garmentNotes, setGarmentNotes] = useState<string[]>([]);
  const [garmentScope, setGarmentScope] = useState<TryOnGarmentScope>("upper");
  const [modelImages, setModelImages] = useState<string[]>([]);
  const [standaloneImages, setStandaloneImages] = useState<string[]>([]);
  const [standaloneItems, setStandaloneItems] = useState<StandaloneImageItem[]>(
    []
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [isWhiteningAll, setIsWhiteningAll] = useState(false);
  const [isUpscalingAll, setIsUpscalingAll] = useState(false);
  const [processedTasks, setProcessedTasks] = useState<ImageGenerationTask[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<PreviewState | null>(null);
  const [isTryOnConfigured, setIsTryOnConfigured] = useState<boolean | null>(null);
  const [selectedTryOnEngine, setSelectedTryOnEngine] =
    useState<TryOnEngine>("fashn");
  const [selectedGeminiModel, setSelectedGeminiModel] =
    useState<GeminiImageModel>("nano_banana_pro");
  const [tryOnConfigMessage, setTryOnConfigMessage] = useState<string | null>(null);
  const [tryOnConfigSummary, setTryOnConfigSummary] = useState<string | null>(null);
  const [isUpscaleConfigured, setIsUpscaleConfigured] = useState<boolean | null>(
    null
  );
  const [upscaleConfigMessage, setUpscaleConfigMessage] = useState<string | null>(
    null
  );
  const [upscaleSettings, setUpscaleSettings] = useState<UpscaleSettings>({
    upscaleMode: "target",
    target: 4,
    factor: 2,
    enhanceDetails: false,
    enhanceRealism: false,
    outputFormat: "jpg",
    outputQuality: 80,
  });
  const processedTasksRef = useRef<ImageGenerationTask[]>([]);

  const selectedModeOption = generationModeOptions[generationMode];
  const selectedTryOnEngineOption =
    tryOnEngineOptions.find((option) => option.value === selectedTryOnEngine) ||
    tryOnEngineOptions[0];
  const selectedGeminiModelOption =
    geminiImageModelOptions.find((option) => option.value === selectedGeminiModel) ||
    geminiImageModelOptions[0];
  const plannedTaskCount = getPlannedTaskCount(
    generationMode,
    clothingImages.length,
    modelImages.length
  );
  const estimateMessage = getEstimateMessage(
    generationMode,
    clothingImages.length,
    modelImages.length
  );
  const selectedGarmentScopeOption =
    TRY_ON_GARMENT_SCOPE_OPTIONS.find((option) => option.value === garmentScope) ||
    TRY_ON_GARMENT_SCOPE_OPTIONS[0];

  useEffect(() => {
    processedTasksRef.current = processedTasks;
  }, [processedTasks]);

  useEffect(() => {
    setGarmentNotes((current) =>
      clothingImages.map((_, index) => current[index] ?? "")
    );
  }, [clothingImages]);

  useEffect(() => {
    setStandaloneItems((current) =>
      standaloneImages.map(
        (source) =>
          current.find((item) => item.source === source) ??
          createStandaloneItem(source)
      )
    );
  }, [standaloneImages]);

  useEffect(() => {
    setClothingImages((current) =>
      current.length > selectedModeOption.clothingMaxImages
        ? current.slice(0, selectedModeOption.clothingMaxImages)
        : current
    );
    setModelImages((current) =>
      current.length > selectedModeOption.modelMaxImages
        ? current.slice(0, selectedModeOption.modelMaxImages)
        : current
    );
    setError(null);
  }, [selectedModeOption.clothingMaxImages, selectedModeOption.modelMaxImages]);

  useEffect(() => {
    const controller = new AbortController();

    const loadTryOnConfig = async () => {
      try {
        const response = await fetchWithRetry("/api/fashn/tryon", {
          method: "GET",
          signal: controller.signal,
        });
        const data = (await response.json()) as ImageApiResponse;

        if (!response.ok || data.success !== true) {
          throw new Error("无法读取 FASHN 配置状态。");
        }

        const configured = Boolean(data.configured);
        setIsTryOnConfigured(configured);
        setSelectedTryOnEngine((current) =>
          current === "fashn" && !configured ? "nano_banana_pro" : current
        );
        setTryOnConfigSummary(
          data.model && data.generationMode && data.resolution && data.outputFormat
            ? `${data.model} / ${data.generationMode} / ${data.resolution} / ${data.outputFormat}`
            : null
        );
        setTryOnConfigMessage(
          configured
            ? "FASHN Try-On Max 已就绪，换装会改走异步任务轮询。"
            : "FASHN 还没配置，当前换装会继续使用 Gemini。Gemini 回退更容易改动脸、身体和背景。"
        );
      } catch (configError) {
        if (controller.signal.aborted) {
          return;
        }

        setIsTryOnConfigured(false);
        setSelectedTryOnEngine((current) =>
          current === "fashn" ? "nano_banana_pro" : current
        );
        setTryOnConfigSummary(null);
        setTryOnConfigMessage(
          normalizeClientError(
            configError,
            "暂时无法验证 FASHN 配置，当前先继续使用 Gemini。Gemini 回退的人物一致性会弱一些。"
          )
        );
      }
    };

    void loadTryOnConfig();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    const loadUpscaleConfig = async () => {
      try {
        const response = await fetchWithRetry("/api/upscale", {
          method: "GET",
          signal: controller.signal,
        });
        const data = (await response.json()) as ImageApiResponse;

        if (!response.ok || data.success !== true) {
          throw new Error("无法读取 Replicate 配置状态。");
        }

        setIsUpscaleConfigured(Boolean(data.configured));
        setUpscaleConfigMessage(
          data.configured
            ? "Replicate 已接通，可直接做高清增强。"
            : "请先在环境变量里配置 REPLICATE_API_TOKEN，再使用变清晰功能。"
        );
      } catch (configError) {
        if (controller.signal.aborted) {
          return;
        }

        setIsUpscaleConfigured(false);
        setUpscaleConfigMessage(
          normalizeClientError(configError, "暂时无法验证 Replicate 配置。")
        );
      }
    };

    void loadUpscaleConfig();

    return () => controller.abort();
  }, []);

  function handleTryOnEngineChange(engine: TryOnEngine) {
    if (engine === "fashn" && isTryOnConfigured !== true) {
      return;
    }

    setSelectedTryOnEngine(engine);

    if (engine !== "fashn") {
      setSelectedGeminiModel(engine);
    }
  }

  const hasUploads = plannedTaskCount > 0;
  const hasResultCards = processedTasks.length > 0;
  const canEnhance = isUpscaleConfigured === true;
  const processedCount = processedTasks.filter(
    (item) => item.tryOn.status === "success" || item.tryOn.status === "error"
  ).length;
  const progress = processedTasks.length
    ? Math.round((processedCount / processedTasks.length) * 100)
    : 0;
  const successfulCount = processedTasks.filter(
    (item) => item.tryOn.status === "success" && Boolean(item.tryOn.image)
  ).length;
  const failedCount = processedTasks.filter(
    (item) => item.tryOn.status === "error"
  ).length;
  const whiteBackgroundCount = processedTasks.filter(
    (item) =>
      item.whiteBackground.status === "success" && Boolean(item.whiteBackground.image)
  ).length;
  const enhancedCount = processedTasks.filter(
    (item) => item.enhanced.status === "success" && Boolean(item.enhanced.image)
  ).length;
  const pendingWhiteCount = processedTasks.filter(
    (item) =>
      item.tryOn.status === "success" &&
      item.tryOn.image &&
      item.whiteBackground.status !== "success"
  ).length;
  const pendingEnhanceCount = processedTasks.filter(
    (item) =>
      item.tryOn.status === "success" &&
      item.tryOn.image &&
      item.enhanced.status !== "success"
  ).length;
  const standaloneWhiteCount = standaloneItems.filter(
    (item) =>
      item.whiteBackground.status === "success" && Boolean(item.whiteBackground.image)
  ).length;
  const standaloneEnhancedCount = standaloneItems.filter(
    (item) => item.enhanced.status === "success" && Boolean(item.enhanced.image)
  ).length;
  const hasStandaloneOutputCards = standaloneItems.some(
    (item) =>
      item.whiteBackground.status !== "idle" || item.enhanced.status !== "idle"
  );
  const enhancementSummary = describeUpscaleSettings(upscaleSettings);
  const resultMode = processedTasks[0]?.mode;
  const resultModeLabel = resultMode ? getGenerationModeLabel(resultMode) : null;
  const isFashnSelected = selectedTryOnEngine === "fashn";
  const tryOnBackendReady = isFashnSelected ? isTryOnConfigured === true : true;
  const tryOnBackendLabel = selectedTryOnEngineOption.label;
  const legacyTryOnBackendSummary =
    tryOnConfigSummary ||
    (tryOnBackendReady ? "tryon-max / quality / 2k / png" : "当前仍走旧换装链路");
  const tryOnBackendSummary = isFashnSelected
    ? tryOnConfigSummary ||
      (isTryOnConfigured === true
        ? selectedTryOnEngineOption.summary || legacyTryOnBackendSummary
        : legacyTryOnBackendSummary)
    : `${selectedTryOnEngineOption.label} / Gemini`;
  const tryOnBackendEndpoint = selectedTryOnEngineOption.endpoint;
  const tryOnBackendStatusLabel = isFashnSelected
    ? isTryOnConfigured === null
      ? "Checking"
      : tryOnBackendReady
        ? "FASHN Ready"
        : "FASHN Unavailable"
    : "Gemini Selected";
  const tryOnBackendStatusClass = isFashnSelected
    ? isTryOnConfigured === null
      ? "bg-slate-100 text-slate-500"
      : tryOnBackendReady
        ? "bg-emerald-100 text-emerald-700"
        : "bg-amber-100 text-amber-700"
    : "bg-slate-100 text-slate-700";
  const tryOnEngineMessage = isFashnSelected
    ? tryOnConfigMessage || "Checking FASHN try-on availability."
    : `Current try-on engine is ${selectedTryOnEngineOption.label}. Free generation keeps its own Gemini model setting.`;
  const workspaceOptions = [
    {
      value: "overview" as const,
      eyebrow: "总览入口",
      label: "功能总览",
      description: "先选入口，再进入对应工作区，减少整页滚动。",
      metric: "4 个入口",
    },
    {
      value: "try-on" as const,
      eyebrow: "换装生成",
      label: "换装工作区",
      description: "模式选择、服装图、模特图和批量换装放在这里。",
      metric: plannedTaskCount > 0 ? `预计 ${plannedTaskCount} 张` : "等待上传",
    },
    {
      value: "free" as const,
      eyebrow: "自由生图",
      label: "文生图 / 图生图",
      description: "自由输入提示词，切换模型，单独进入生成。",
      metric: selectedGeminiModelOption.label,
    },
    {
      value: "post" as const,
      eyebrow: "后处理",
      label: "白底图 / 高清增强",
      description: "集中处理白底、增强和单图后处理，不和主流程混在一起。",
      metric:
        standaloneImages.length + successfulCount > 0
          ? `${standaloneImages.length + successfulCount} 张可处理`
          : "暂无待处理",
    },
    {
      value: "results" as const,
      eyebrow: "结果查看",
      label: "结果总览",
      description: "统一查看换装图、白底图和增强图，不再跟上传区连在一起。",
      metric: hasResultCards ? `${processedTasks.length} 张结果` : "暂无结果",
    },
  ];
  const activeWorkspaceOption =
    workspaceOptions.find((option) => option.value === activeWorkspace) ||
    workspaceOptions[0];
  const showPostProcessingTools =
    activeWorkspace === "post" ||
    activeWorkspace === "try-on" ||
    activeWorkspace === "results";

  function replaceProcessedTasks(nextTasks: ImageGenerationTask[]) {
    processedTasksRef.current = nextTasks;
    setProcessedTasks(nextTasks);
  }

  function updateUpscaleSettings<Key extends keyof UpscaleSettings>(
    key: Key,
    value: UpscaleSettings[Key]
  ) {
    setUpscaleSettings((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function updateProcessedTask(
    index: number,
    updater: (current: ImageGenerationTask) => ImageGenerationTask
  ) {
    const currentTasks = processedTasksRef.current;

    if (!currentTasks[index]) {
      return;
    }

    replaceProcessedTasks(
      currentTasks.map((item, itemIndex) =>
        itemIndex === index ? updater(item) : item
      )
    );
  }

  function updateStandaloneItem(
    index: number,
    updater: (current: StandaloneImageItem) => StandaloneImageItem
  ) {
    setStandaloneItems((current) => {
      const nextItems = [...current];
      const fallbackSource = standaloneImages[index] ?? "";
      const baseItem = nextItems[index] ?? createStandaloneItem(fallbackSource);

      nextItems[index] = updater(baseItem);
      return nextItems;
    });
  }

  function openPreview(src: string, title: string) {
    setPreviewImage({ src, title });
  }

  async function handleDownload(imageData: string, filename: string) {
    try {
      let dataUrl = imageData;

      if (imageData.startsWith("http://") || imageData.startsWith("https://")) {
        const response = await fetchWithRetry("/api/download", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrl: imageData }),
        });
        const json = (await response.json()) as {
          success?: boolean;
          error?: string;
          data?: string;
        };

        if (!response.ok || json.success !== true || !json.data) {
          throw new Error(json.error || "下载代理失败。");
        }

        dataUrl = json.data;
      }

      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (downloadError) {
      setError(normalizeClientError(downloadError, "下载失败，请稍后重试。"));
    }
  }

  async function readImageResponse(response: Response, actionLabel: string) {
    const responseText = await response.text();
    let data: ImageApiResponse | null = null;

    if (responseText) {
      try {
        data = JSON.parse(responseText) as ImageApiResponse;
      } catch {
        data = null;
      }
    }

    if (!response.ok || data?.success !== true) {
      throw new Error(
        data?.error || responseText || `${actionLabel}失败（${response.status}）`
      );
    }

    if (!data.result) {
      throw new Error(`${actionLabel}未返回图片结果。`);
    }

    if (!isValidImageSource(data.result)) {
      throw new Error(`${actionLabel}返回的不是有效图片。`);
    }

    return data.result;
  }

  async function getDrawableImageSource(imageData: string) {
    if (!imageData.startsWith("http://") && !imageData.startsWith("https://")) {
      return imageData;
    }

    const response = await fetchWithRetry("/api/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl: imageData }),
    });
    const json = (await response.json()) as {
      success?: boolean;
      error?: string;
      data?: string;
    };

    if (!response.ok || json.success !== true || !json.data) {
      throw new Error(json.error || "图片比例校正前的下载代理失败。");
    }

    return json.data;
  }

  async function normalizeTryOnResultToModelAspect(
    data: { result: string; format: string },
    modelImage: string
  ) {
    try {
      const [modelDimensions, resultDimensions] = await Promise.all([
        readImageDimensions(modelImage),
        readImageDimensions(data.result),
      ]);
      const modelRatio = getAspectRatio(modelDimensions);
      const resultRatio = getAspectRatio(resultDimensions);
      const ratioDelta = Math.abs(modelRatio - resultRatio) / modelRatio;

      if (ratioDelta <= TRY_ON_RESULT_ASPECT_TOLERANCE) {
        return data;
      }

      const drawableSource = await getDrawableImageSource(data.result);
      const drawableImage = await loadImageElement(drawableSource);
      const drawableDimensions = {
        width: drawableImage.naturalWidth,
        height: drawableImage.naturalHeight,
      };
      const canvasDimensions = getCanvasDimensionsForAspect(
        drawableDimensions,
        modelDimensions
      );
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");

      if (!context) {
        throw new Error("浏览器无法创建比例校正画布。");
      }

      canvas.width = canvasDimensions.width;
      canvas.height = canvasDimensions.height;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);

      const rect = getCoverDrawRect(drawableDimensions, canvasDimensions);
      context.drawImage(
        drawableImage,
        rect.x,
        rect.y,
        rect.width,
        rect.height
      );

      return {
        result: canvas.toDataURL("image/png"),
        format: "png",
      };
    } catch (aspectError) {
      console.warn("Failed to normalize try-on result aspect ratio:", aspectError);
      return data;
    }
  }

  async function createFashnTryOnJob(
    clothingImage: string,
    modelImage: string,
    garmentNote: string,
    scope: TryOnGarmentScope
  ) {
    const response = await fetchWithRetry("/api/fashn/tryon", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        clothingImage,
        modelImage,
        garmentNote,
        garmentScope: scope,
      }),
    });

    const responseText = await response.text();
    let data: ImageApiResponse | null = null;

    if (responseText) {
      try {
        data = JSON.parse(responseText) as ImageApiResponse;
      } catch {
        data = null;
      }
    }

    if (!response.ok || data?.success !== true || !data.jobId) {
      throw new Error(
        data?.error || responseText || "FASHN 鎹㈣浠诲姟鍒涘缓澶辫触銆?"
      );
    }

    return data;
  }

  async function pollFashnTryOnJob(
    jobId: string,
    onProgress?: (detail: string) => void
  ) {
    for (let attempt = 0; attempt < FASHN_MAX_POLL_ATTEMPTS; attempt += 1) {
      if (attempt > 0) {
        await sleep(FASHN_POLL_INTERVAL_MS);
      }

      const response = await fetchWithRetry(
        `/api/fashn/tryon/${encodeURIComponent(jobId)}`,
        {
          method: "GET",
        }
      );
      const responseText = await response.text();
      let data: ImageApiResponse | null = null;

      if (responseText) {
        try {
          data = JSON.parse(responseText) as ImageApiResponse;
        } catch {
          data = null;
        }
      }

      if (!response.ok || data?.success !== true) {
        throw new Error(
          data?.error || responseText || "FASHN 鎹㈣鐘舵€佽疆璇㈠け璐ャ€?"
        );
      }

      const providerStatus = data.status as TryOnProviderStatus | undefined;
      onProgress?.(describeTryOnProviderStatus(providerStatus));

      if (providerStatus === "completed") {
        if (!data.result) {
          throw new Error("FASHN 宸插畬鎴愶紝浣嗘病鏈夎繑鍥炲浘鐗囩粨鏋溿€?");
        }

        return {
          result: data.result,
          format:
            data.outputFormat ||
            inferImageFormatFromSource(data.result) ||
            "png",
        };
      }

      if (providerStatus === "failed") {
        throw new Error(data.error || "FASHN 鎹㈣浠诲姟澶辫触銆?");
      }
    }

    throw new Error("FASHN 鎹㈣瓒呮椂锛岃绋嶅悗鍐嶆煡鐪嬨€?");
  }

  async function requestTryOnImage(
    clothingImage: string,
    modelImage: string,
    garmentNote: string,
    scope: TryOnGarmentScope,
    onProgress?: (detail: string) => void
  ) {
    if (selectedTryOnEngine === "fashn") {
      onProgress?.("正在提交 FASHN Try-On Max 任务...");
      if (isTryOnConfigured !== true) {
        throw new Error(
          tryOnConfigMessage || "FASHN is not configured yet for this workspace."
        );
      }
      const job = await createFashnTryOnJob(
        clothingImage,
        modelImage,
        garmentNote,
        scope
      );
      onProgress?.(
        describeTryOnProviderStatus(
          (job.status as TryOnProviderStatus | undefined) || "starting"
        )
      );
      return pollFashnTryOnJob(job.jobId!, onProgress);
    }

    onProgress?.("FASHN 未配置，当前继续使用 Gemini 换装。");
    onProgress?.(`Submitting ${selectedTryOnEngineOption.label} try-on request...`);
    const geminiModel = selectedTryOnEngine as GeminiImageModel;
    const modelDimensions = await readImageDimensions(modelImage).catch(() => null);
    const geminiTryOnSize =
      geminiModel === "image2"
        ? "1024x1024"
        : getClosestTryOnSizeForAspect(geminiModel, modelDimensions);
    onProgress?.(`按模特原图比例请求输出尺寸：${geminiTryOnSize}`);
    const response = await fetchWithRetry("/api/gemini", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        clothingImage,
        modelImage,
        garmentNote,
        garmentScope: scope,
        modelImageDimensions: modelDimensions || undefined,
        type: "virtual-tryon",
        size: geminiTryOnSize,
        model: geminiModel,
      }),
    });

    return readImageResponse(response, "换装生成");
  }

  async function requestConfiguredTryOnImage(
    clothingImage: string,
    modelImage: string,
    garmentNote: string,
    scope: TryOnGarmentScope,
    onProgress?: (detail: string) => void
  ) {
    const result = await requestTryOnImage(
      clothingImage,
      modelImage,
      garmentNote,
      scope,
      onProgress
    );

    const data =
      typeof result === "string"
        ? {
        result,
        format: inferImageFormatFromSource(result) || "png",
          }
        : result;

    return normalizeTryOnResultToModelAspect(data, modelImage);
  }

  async function requestWhiteBackgroundImage(image: string) {
    const response = await fetchWithRetry("/api/gemini", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image,
        type: "white-background",
        size: "1024x1024",
        model: selectedGeminiModel,
      }),
    });

    return readImageResponse(response, "换白底");
  }

  async function requestUpscaledImage(image: string, settings: UpscaleSettings) {
    const response = await fetchWithRetry("/api/upscale", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image,
        settings,
      }),
    });

    const result = await readImageResponse(response, "清晰增强");

    return {
      result,
      format: settings.outputFormat,
    };
  }

  async function runTryOn(
    index: number,
    task: ImageGenerationTask,
    isRetry: boolean
  ) {
    updateProcessedTask(index, (current) => ({
      ...current,
      tryOn: createTaskState({
        status: "processing",
        retryCount: isRetry ? current.tryOn.retryCount + 1 : current.tryOn.retryCount,
        detail:
          selectedTryOnEngine === "fashn"
            ? "正在提交 FASHN Try-On Max 任务..."
            : "正在提交 Gemini 换装请求...",
      }),
      whiteBackground: createTaskState(),
      enhanced: createTaskState(),
    }));

    try {
      const data = await requestConfiguredTryOnImage(
        task.clothingImage,
        task.modelImage,
        task.garmentNote,
        task.garmentScope,
        (detail) => {
          updateProcessedTask(index, (current) => ({
            ...current,
            tryOn: {
              ...current.tryOn,
              detail,
            },
          }));
        }
      );

      updateProcessedTask(index, (current) => ({
        ...current,
        tryOn: {
          ...current.tryOn,
          status: "success",
          image: data.result,
          error: null,
          format: data.format,
          detail: null,
        },
      }));
    } catch (requestError) {
      const message = normalizeClientError(requestError, "换装生成失败，请稍后重试。");

      updateProcessedTask(index, (current) => ({
        ...current,
        tryOn: {
          ...current.tryOn,
          status: "error",
          image: undefined,
          error: message,
          detail: null,
        },
        whiteBackground: createTaskState(),
        enhanced: createTaskState(),
      }));
      setError(
        `服装 ${task.clothingIndex + 1} / 模特 ${task.modelIndex + 1} 换装失败：${message}`
      );
    }
  }

  async function handleStartProcessing() {
    if (generationMode === "multi-clothing-single-model") {
      if (clothingImages.length === 0) {
        setError("请先上传至少一张服装图。");
        return;
      }
      if (!modelImages[0]) {
        setError("请先上传一张固定模特图。");
        return;
      }
    }

    if (generationMode === "single-clothing-multi-model") {
      if (!clothingImages[0]) {
        setError("请先上传一张固定服装图。");
        return;
      }
      if (modelImages.length === 0) {
        setError("请先上传至少一张模特图。");
        return;
      }
    }

    if (generationMode === "all-combinations") {
      if (clothingImages.length === 0) {
        setError("请先上传至少一张服装图。");
        return;
      }
      if (modelImages.length === 0) {
        setError("请先上传至少一张模特图。");
        return;
      }
    }

    const tasks = buildGenerationTasks(
      generationMode,
      clothingImages,
      modelImages,
      garmentNotes,
      garmentScope
    );

    if (tasks.length === 0) {
      setError("当前上传内容还不足以生成任务，请先补齐当前模式需要的图片。");
      return;
    }

    setError(null);
    setIsProcessing(true);
    replaceProcessedTasks(tasks);

    try {
      for (const [index, task] of tasks.entries()) {
        await runTryOn(index, task, false);
      }
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleRetryResult(index: number) {
    const item = processedTasksRef.current[index];

    if (!item) {
      return;
    }

    setError(null);
    await runTryOn(index, item, true);
  }

  async function handleWhiteBackgroundResult(index: number) {
    const item = processedTasksRef.current[index];

    if (!item?.tryOn.image) {
      setError("请先生成换装图，再执行换白底。");
      return;
    }

    const shouldIncrementRetry = item.whiteBackground.status !== "idle";

    setError(null);
    updateProcessedTask(index, (current) => ({
      ...current,
      whiteBackground: createTaskState({
        status: "processing",
        retryCount: shouldIncrementRetry
          ? current.whiteBackground.retryCount + 1
          : current.whiteBackground.retryCount,
      }),
    }));

    try {
      const result = await requestWhiteBackgroundImage(item.tryOn.image);

      updateProcessedTask(index, (current) => ({
        ...current,
        whiteBackground: {
          ...current.whiteBackground,
          status: "success",
          image: result,
          error: null,
        },
      }));
    } catch (requestError) {
      const message = normalizeClientError(requestError, "换白底失败，请稍后重试。");

      updateProcessedTask(index, (current) => ({
        ...current,
        whiteBackground: {
          ...current.whiteBackground,
          status: "error",
          error: message,
        },
      }));
      setError(
        `服装 ${item.clothingIndex + 1} / 模特 ${item.modelIndex + 1} 换白底失败：${message}`
      );
    }
  }

  async function handleWhiteBackgroundAll() {
    if (successfulCount === 0) {
      setError("请先生成至少一张成功的换装图，再执行整批换白底。");
      return;
    }

    const targetIndices = processedTasksRef.current
      .map((item, itemIndex) => ({ item, itemIndex }))
      .filter(
        ({ item }) =>
          item.tryOn.status === "success" &&
          item.tryOn.image &&
          item.whiteBackground.status !== "success"
      )
      .map(({ itemIndex }) => itemIndex);

    if (targetIndices.length === 0) {
      setError("当前成功结果都已经有白底图了。");
      return;
    }

    setError(null);
    setIsWhiteningAll(true);

    try {
      for (const index of targetIndices) {
        await handleWhiteBackgroundResult(index);
      }
    } finally {
      setIsWhiteningAll(false);
    }
  }

  async function handleUpscaleResult(index: number) {
    if (!canEnhance) {
      setError("请先配置 REPLICATE_API_TOKEN，再使用变清晰功能。");
      return;
    }

    const item = processedTasksRef.current[index];

    if (!item?.tryOn.image) {
      setError("请先生成换装图，再执行变清晰。");
      return;
    }

    const settingsPayload = { ...upscaleSettings };
    const shouldIncrementRetry = item.enhanced.status !== "idle";

    setError(null);
    updateProcessedTask(index, (current) => ({
      ...current,
      enhanced: createTaskState({
        status: "processing",
        retryCount: shouldIncrementRetry
          ? current.enhanced.retryCount + 1
          : current.enhanced.retryCount,
        format: settingsPayload.outputFormat,
      }),
    }));

    try {
      const data = await requestUpscaledImage(item.tryOn.image, settingsPayload);

      updateProcessedTask(index, (current) => ({
        ...current,
        enhanced: {
          ...current.enhanced,
          status: "success",
          image: data.result,
          error: null,
          format: data.format,
        },
      }));
    } catch (upscaleError) {
      const message = normalizeClientError(
        upscaleError,
        "图片增强失败，请稍后重试。"
      );

      updateProcessedTask(index, (current) => ({
        ...current,
        enhanced: {
          ...current.enhanced,
          status: "error",
          error: message,
          format: settingsPayload.outputFormat,
        },
      }));
      setError(
        `服装 ${item.clothingIndex + 1} / 模特 ${item.modelIndex + 1} 变清晰失败：${message}`
      );
    }
  }

  async function handleUpscaleAll() {
    if (!canEnhance) {
      setError("请先配置 REPLICATE_API_TOKEN，再执行整批变清晰。");
      return;
    }

    if (successfulCount === 0) {
      setError("请先生成至少一张成功的换装图，再执行整批变清晰。");
      return;
    }

    const targetIndices = processedTasksRef.current
      .map((item, itemIndex) => ({ item, itemIndex }))
      .filter(
        ({ item }) =>
          item.tryOn.status === "success" &&
          item.tryOn.image &&
          item.enhanced.status !== "success"
      )
      .map(({ itemIndex }) => itemIndex);

    if (targetIndices.length === 0) {
      setError("当前成功结果都已经有高清增强图了。");
      return;
    }

    setError(null);
    setIsUpscalingAll(true);

    try {
      for (const index of targetIndices) {
        await handleUpscaleResult(index);
      }
    } finally {
      setIsUpscalingAll(false);
    }
  }

  async function handleStandaloneWhiteBackground(
    index: number,
    sourceImage: string
  ) {
    const currentItem = standaloneItems[index] ?? createStandaloneItem(sourceImage);
    const shouldIncrementRetry = currentItem.whiteBackground.status !== "idle";

    setError(null);
    updateStandaloneItem(index, (current) => ({
      ...current,
      whiteBackground: createTaskState({
        status: "processing",
        retryCount: shouldIncrementRetry
          ? current.whiteBackground.retryCount + 1
          : current.whiteBackground.retryCount,
      }),
    }));

    try {
      const result = await requestWhiteBackgroundImage(sourceImage);

      updateStandaloneItem(index, (current) => ({
        ...current,
        whiteBackground: {
          ...current.whiteBackground,
          status: "success",
          image: result,
          error: null,
        },
      }));
    } catch (requestError) {
      const message = normalizeClientError(
        requestError,
        "独立图片换白底失败，请稍后重试。"
      );

      updateStandaloneItem(index, (current) => ({
        ...current,
        whiteBackground: {
          ...current.whiteBackground,
          status: "error",
          error: message,
        },
      }));
      setError(`独立图片 ${index + 1} 换白底失败：${message}`);
    }
  }

  async function handleStandaloneUpscale(index: number, sourceImage: string) {
    if (!canEnhance) {
      setError("请先配置 REPLICATE_API_TOKEN，再使用变清晰功能。");
      return;
    }

    const currentItem = standaloneItems[index] ?? createStandaloneItem(sourceImage);
    const settingsPayload = { ...upscaleSettings };
    const shouldIncrementRetry = currentItem.enhanced.status !== "idle";

    setError(null);
    updateStandaloneItem(index, (current) => ({
      ...current,
      enhanced: createTaskState({
        status: "processing",
        retryCount: shouldIncrementRetry
          ? current.enhanced.retryCount + 1
          : current.enhanced.retryCount,
        format: settingsPayload.outputFormat,
      }),
    }));

    try {
      const data = await requestUpscaledImage(sourceImage, settingsPayload);

      updateStandaloneItem(index, (current) => ({
        ...current,
        enhanced: {
          ...current.enhanced,
          status: "success",
          image: data.result,
          error: null,
          format: data.format,
        },
      }));
    } catch (upscaleError) {
      const message = normalizeClientError(
        upscaleError,
        "独立图片增强失败，请稍后重试。"
      );

      updateStandaloneItem(index, (current) => ({
        ...current,
        enhanced: {
          ...current.enhanced,
          status: "error",
          error: message,
          format: settingsPayload.outputFormat,
        },
      }));
      setError(`独立图片 ${index + 1} 变清晰失败：${message}`);
    }
  }

  return (
    <div className="min-h-screen pb-10">
      <StudioHeader
        eyebrow="图片工坊"
        title="换装、自由生图、后处理，分入口切换"
        description="把长页面拆成几个点击进入的工作区：换装生成、自由生图、后处理和结果查看，当前只展示你正在处理的模块。"
        badge="图片处理工作台"
      />

      <main className="mx-auto mt-8 w-full max-w-[1580px] px-4 sm:px-6 lg:px-8">
        <div className="flex w-full flex-col gap-6">
          <section className="overflow-hidden rounded-[2rem] border border-white/70 bg-[linear-gradient(135deg,_rgba(15,23,42,0.96),_rgba(39,39,42,0.92))] p-6 text-white shadow-[0_32px_90px_rgba(15,23,42,0.24)] sm:p-8">
            <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl space-y-5">
                <div className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm text-white/75">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  {activeWorkspaceOption.eyebrow}
                </div>
                <div className="space-y-4">
                  <h1 className="font-serif text-4xl tracking-[-0.04em] text-balance sm:text-5xl">
                    {activeWorkspace === "overview"
                      ? "先点入口，再进入对应工作区。"
                      : activeWorkspace === "try-on"
                        ? "换装生成单独处理，不再和别的模块挤在一起。"
                        : activeWorkspace === "free"
                          ? "自由生图独立成区，提示词和结果查看更集中。"
                          : activeWorkspace === "post"
                            ? "白底和增强拆出来做，后处理终于不用来回找。"
                            : "结果集中看，不用再从上传区一路往下翻。"}
                  </h1>
                  <p className="max-w-2xl text-base leading-8 text-white/70 sm:text-lg">
                    当前入口：
                    <span className="font-semibold text-white"> {activeWorkspaceOption.label}</span>
                    。{activeWorkspaceOption.description}
                  </p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  {activeWorkspace === "try-on" ? (
                    <button
                      type="button"
                      onClick={() => void handleStartProcessing()}
                      disabled={!hasUploads || isProcessing}
                      className={`inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold transition ${
                        !hasUploads || isProcessing
                          ? "cursor-not-allowed bg-white/10 text-white/40"
                          : "bg-amber-300 text-slate-950 hover:bg-amber-200"
                      }`}
                    >
                      {isProcessing ? "当前批次生成中..." : "开始当前模式生成"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        setActiveWorkspace(
                          activeWorkspace === "overview" ? "try-on" : "overview"
                        )
                      }
                      className="inline-flex items-center justify-center rounded-full bg-amber-300 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
                    >
                      {activeWorkspace === "overview" ? "进入换装工作区" : "返回功能入口"}
                    </button>
                  )}
                  <Link
                    href="/"
                    className="inline-flex items-center justify-center rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                  >
                    返回首页
                  </Link>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-4 lg:w-[38rem]">
                <div className="rounded-[1.5rem] border border-white/10 bg-white/6 p-4">
                  <p className="text-xs uppercase tracking-[0.28em] text-white/40">
                    服装图
                  </p>
                  <p className="mt-3 text-3xl font-semibold">{clothingImages.length}</p>
                </div>
                <div className="rounded-[1.5rem] border border-white/10 bg-white/6 p-4">
                  <p className="text-xs uppercase tracking-[0.28em] text-white/40">
                    模特图
                  </p>
                  <p className="mt-3 text-3xl font-semibold">{modelImages.length}</p>
                </div>
                <div className="rounded-[1.5rem] border border-white/10 bg-white/6 p-4">
                  <p className="text-xs uppercase tracking-[0.28em] text-white/40">
                    预计结果
                  </p>
                  <p className="mt-3 text-3xl font-semibold">{plannedTaskCount}</p>
                </div>
                <div className="rounded-[1.5rem] border border-white/10 bg-white/6 p-4">
                  <p className="text-xs uppercase tracking-[0.28em] text-white/40">
                    已成功
                  </p>
                  <p className="mt-3 text-3xl font-semibold">{successfulCount}</p>
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)_320px]">
            <aside className="xl:sticky xl:top-6 xl:self-start">
              <article className="rounded-[2rem] border border-slate-200/80 bg-white/85 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                    功能入口
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                    点击进入对应工作区
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    把换装、自由生图、后处理和结果查看拆开，当前页面只展示正在处理的模块。
                  </p>
                </div>

                <div className="mt-5 space-y-3">
                  {workspaceOptions.map((option) => {
                    const isActive = option.value === activeWorkspace;

                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setActiveWorkspace(option.value)}
                        className={`w-full rounded-[1.5rem] border px-4 py-4 text-left transition ${
                          isActive
                            ? "border-slate-950 bg-slate-950 text-white shadow-[0_18px_40px_rgba(15,23,42,0.16)]"
                            : "border-slate-200 bg-slate-50 text-slate-900 hover:border-slate-400 hover:bg-white"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p
                              className={`text-[11px] font-semibold uppercase tracking-[0.22em] ${
                                isActive ? "text-white/60" : "text-slate-400"
                              }`}
                            >
                              {option.eyebrow}
                            </p>
                            <p className="mt-2 text-base font-semibold">{option.label}</p>
                          </div>
                          <span
                            className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                              isActive
                                ? "bg-white/10 text-white"
                                : "bg-white text-slate-500"
                            }`}
                          >
                            {option.metric}
                          </span>
                        </div>
                        <p className={`mt-3 text-sm leading-6 ${isActive ? "text-white/75" : "text-slate-500"}`}>
                          {option.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </article>
            </aside>

            <div className="space-y-6">
              {activeWorkspace === "overview" ? (
                <article className="rounded-[2rem] border border-slate-200/80 bg-white/85 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                        工作区总览
                      </p>
                      <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                        现在先选入口，再进入对应模块
                      </h2>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        原来一页里所有区域都同时展开，现在改成入口式工作台，滚动距离会短很多。
                      </p>
                    </div>
                    <span className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
                      当前共 4 个入口
                    </span>
                  </div>

                  <div className="mt-6 grid gap-4 xl:grid-cols-2">
                    {workspaceOptions
                      .filter((option) => option.value !== "overview")
                      .map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setActiveWorkspace(option.value)}
                          className="rounded-[1.75rem] border border-slate-200 bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.16),_transparent_52%)] px-5 py-5 text-left transition hover:border-slate-400 hover:bg-white"
                        >
                          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                            {option.eyebrow}
                          </p>
                          <div className="mt-4 flex items-start justify-between gap-4">
                            <div>
                              <p className="text-xl font-semibold tracking-[-0.03em] text-slate-950">
                                {option.label}
                              </p>
                              <p className="mt-3 text-sm leading-6 text-slate-600">
                                {option.description}
                              </p>
                            </div>
                            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500">
                              {option.metric}
                            </span>
                          </div>
                          <p className="mt-5 text-sm font-semibold text-slate-950">
                            点击进入
                          </p>
                        </button>
                      ))}
                  </div>
                </article>
              ) : null}

              {activeWorkspace === "try-on" ? (
                <article className="rounded-[2rem] border border-slate-200/80 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                      生成模式
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                      先明确本轮怎么组合任务
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      模式切换后，上传限制、提示文案和任务数量都会同步变化。
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
                    预计 {plannedTaskCount} 张
                  </span>
                </div>

                <div className="mt-6 grid gap-3 xl:grid-cols-3">
                  {generationModeOrder.map((mode) => {
                    const option = generationModeOptions[mode];
                    const isActive = generationMode === mode;

                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setGenerationMode(mode)}
                        className={`rounded-[1.5rem] border px-5 py-5 text-left transition ${
                          isActive
                            ? "border-slate-950 bg-slate-950 text-white"
                            : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-400 hover:bg-white"
                        }`}
                      >
                        <p className="text-xs font-semibold uppercase tracking-[0.22em] opacity-70">
                          {option.shortTitle}
                        </p>
                        <p className="mt-3 text-lg font-semibold">{option.title}</p>
                        <p className="mt-3 text-sm leading-6 opacity-80">
                          {option.description}
                        </p>
                        <p className="mt-4 text-xs leading-6 opacity-70">
                          服装上限 {option.clothingMaxImages} 张 / 模特上限{" "}
                          {option.modelMaxImages} 张
                        </p>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-6">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                        换装范围
                      </p>
                      <h3 className="mt-2 text-lg font-semibold tracking-[-0.02em] text-slate-950">
                        选择这次允许模型替换的服装区域
                      </h3>
                    </div>
                    <span className="rounded-full bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-800">
                      当前：{selectedGarmentScopeOption.label}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 xl:grid-cols-3">
                    {TRY_ON_GARMENT_SCOPE_OPTIONS.map((option) => {
                      const isActive = garmentScope === option.value;

                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setGarmentScope(option.value)}
                          className={`rounded-[1.5rem] border px-5 py-4 text-left transition ${
                            isActive
                              ? "border-amber-400 bg-amber-50 text-slate-950 shadow-[0_14px_34px_rgba(245,158,11,0.16)]"
                              : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-400 hover:bg-white"
                          }`}
                        >
                          <p className="text-base font-semibold">{option.label}</p>
                          <p className="mt-2 text-sm leading-6 opacity-80">
                            {option.description}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-5 rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-7 text-slate-600">
                  {estimateMessage} 换装范围：{selectedGarmentScopeOption.description}
                </div>

                {plannedTaskCount >= 20 ? (
                  <div className="mt-4 rounded-[1.5rem] border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-7 text-amber-800">
                    当前任务量较大，将连续生成 {plannedTaskCount} 张结果。建议先确认服装图、模特图和备注都已准备好再开始。
                  </div>
                ) : null}
                </article>
              ) : null}

              {activeWorkspace === "try-on" ? (
                <article className="rounded-[2rem] border border-slate-200/80 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
                <MultiImageUploader
                  images={clothingImages}
                  onImagesChange={setClothingImages}
                  title={selectedModeOption.clothingTitle}
                  description={selectedModeOption.clothingDescription}
                  maxImages={selectedModeOption.clothingMaxImages}
                  uploadFolder="clothing"
                  renderImageFooter={({ index }) => (
                    <div className="space-y-3">
                      <label className="block">
                        <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                          服装备注
                        </span>
                        <textarea
                          rows={3}
                          value={garmentNotes[index] ?? ""}
                          onChange={(event) =>
                            setGarmentNotes((current) =>
                              clothingImages.map((_, noteIndex) =>
                                noteIndex === index
                                  ? event.target.value
                                  : current[noteIndex] ?? ""
                              )
                            )
                          }
                          placeholder="可填写长度、版型、露肤范围、搭配要求等，例如：保持袖长，不要改花纹。"
                          className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700 outline-none transition focus:border-slate-950"
                        />
                      </label>
                      <p className="text-xs leading-6 text-slate-500">
                        这段备注会跟着当前服装图进入请求，在三种模式下都有效。
                      </p>
                    </div>
                  )}
                />
                </article>
              ) : null}

              {activeWorkspace === "try-on" ? (
                <article className="rounded-[2rem] border border-slate-200/80 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
                <MultiImageUploader
                  images={modelImages}
                  onImagesChange={setModelImages}
                  title={selectedModeOption.modelTitle}
                  description={selectedModeOption.modelDescription}
                  maxImages={selectedModeOption.modelMaxImages}
                  uploadFolder="model"
                />
                </article>
              ) : null}

              {activeWorkspace === "post" ? (
                <article className="rounded-[2rem] border border-slate-200/80 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
                <MultiImageUploader
                  images={standaloneImages}
                  onImagesChange={setStandaloneImages}
                  title="单独处理图片区"
                  description="不走换装流程，直接对现有图片单张一键换白底或变清晰。成功后会分别保留白底图和增强图。"
                  maxImages={10}
                  uploadFolder="standalone"
                  renderImageFooter={({ image, index }) => {
                    const item = standaloneItems[index] ?? createStandaloneItem(image);

                    return (
                      <div className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                          <span
                            className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${getStatusPillClass(
                              item.whiteBackground.status
                            )}`}
                          >
                            白底：{getStatusLabel(item.whiteBackground.status)}
                          </span>
                          <span
                            className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${getStatusPillClass(
                              item.enhanced.status
                            )}`}
                          >
                            增强：{getStatusLabel(item.enhanced.status)}
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              void handleStandaloneWhiteBackground(index, image)
                            }
                            disabled={item.whiteBackground.status === "processing"}
                            className={`inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition ${
                              item.whiteBackground.status === "processing"
                                ? "cursor-not-allowed bg-amber-100 text-amber-700"
                                : "bg-amber-300 text-slate-950 hover:bg-amber-200"
                            }`}
                          >
                            {getWhiteBackgroundButtonLabel(item.whiteBackground)}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleStandaloneUpscale(index, image)}
                            disabled={item.enhanced.status === "processing" || !canEnhance}
                            className={`inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition ${
                              item.enhanced.status === "processing" || !canEnhance
                                ? "cursor-not-allowed bg-slate-100 text-slate-400"
                                : "bg-slate-950 text-white hover:bg-slate-800"
                            }`}
                          >
                            {getEnhanceButtonLabel(item.enhanced, canEnhance)}
                          </button>
                        </div>

                        {item.whiteBackground.error ? (
                          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm leading-6 text-rose-700">
                            白底处理失败：{item.whiteBackground.error}
                          </p>
                        ) : null}
                        {item.enhanced.error ? (
                          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm leading-6 text-rose-700">
                            增强处理失败：{item.enhanced.error}
                          </p>
                        ) : null}
                      </div>
                    );
                  }}
                />

                <div className="mt-5 flex flex-wrap gap-3 text-sm text-slate-600">
                  <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">
                    独立白底图 {standaloneWhiteCount}
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">
                    独立增强图 {standaloneEnhancedCount}
                  </span>
                </div>
                </article>
              ) : null}

              {activeWorkspace === "post" && hasStandaloneOutputCards ? (
                <article className="rounded-[2rem] border border-slate-200/80 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                        独立处理结果
                      </p>
                      <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                        白底图和增强图现在单独展示
                      </h2>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        不走换装流程的结果会固定保留在这里，处理完成后可以直接预览和下载。
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-3 text-sm text-slate-600">
                      <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">
                        独立白底图 {standaloneWhiteCount}
                      </span>
                      <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">
                        独立增强图 {standaloneEnhancedCount}
                      </span>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-4 xl:grid-cols-2">
                    {standaloneImages.map((image, index) => {
                      const item = standaloneItems[index] ?? createStandaloneItem(image);

                      return (
                        <article
                          key={`standalone-result-${index}-${image.slice(0, 24)}`}
                          className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-slate-50"
                        >
                          <div className="flex flex-col gap-3 border-b border-slate-200 bg-white px-4 py-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                                图片 {index + 1}
                              </p>
                              <span
                                className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${getStatusPillClass(
                                  item.whiteBackground.status
                                )}`}
                              >
                                白底：{getStatusLabel(item.whiteBackground.status)}
                              </span>
                              <span
                                className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${getStatusPillClass(
                                  item.enhanced.status
                                )}`}
                              >
                                增强：{getStatusLabel(item.enhanced.status)}
                              </span>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              {item.whiteBackground.image ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleDownload(
                                      item.whiteBackground.image!,
                                      buildStandaloneFilename(index, "white-background", "png")
                                    )
                                  }
                                  className="inline-flex items-center justify-center rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                                >
                                  下载白底图
                                </button>
                              ) : null}

                              {item.enhanced.image ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleDownload(
                                      item.enhanced.image!,
                                      buildStandaloneFilename(
                                        index,
                                        "enhanced",
                                        item.enhanced.format || upscaleSettings.outputFormat
                                      )
                                    )
                                  }
                                  className="inline-flex items-center justify-center rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                                >
                                  下载增强图
                                </button>
                              ) : null}
                            </div>
                          </div>

                          <div className="grid gap-px bg-slate-200 md:grid-cols-3">
                            <PreviewTile
                              title="原图"
                              image={image}
                              alt={`独立处理原图 ${index + 1}`}
                              status="success"
                              emptyTitle="暂无原图"
                              emptyDescription="当前卡片没有可展示的原图。"
                              description="这张图是独立白底图和增强图的来源。"
                              backgroundClassName="bg-white"
                              onPreview={() => openPreview(image, `独立处理 ${index + 1} 原图`)}
                            />

                            <PreviewTile
                              title="白底图"
                              image={item.whiteBackground.image}
                              alt={`独立白底图 ${index + 1}`}
                              status={item.whiteBackground.status}
                              emptyTitle="还没有白底图"
                              emptyDescription="点击上方“换白底”后，这里会显示对应的独立白底版本。"
                              description={
                                item.whiteBackground.retryCount > 0
                                  ? `已重试 ${item.whiteBackground.retryCount} 次`
                                  : "白底完成后会保留在这里，方便继续预览和下载。"
                              }
                              backgroundClassName="bg-slate-50"
                              error={item.whiteBackground.error}
                              onPreview={
                                item.whiteBackground.image
                                  ? () =>
                                      openPreview(
                                        item.whiteBackground.image!,
                                        `独立处理 ${index + 1} 白底图`
                                      )
                                  : undefined
                              }
                            />

                            <PreviewTile
                              title="增强图"
                              image={item.enhanced.image}
                              alt={`独立增强图 ${index + 1}`}
                              status={item.enhanced.status}
                              emptyTitle="还没有增强图"
                              emptyDescription="点击上方“变清晰”后，这里会显示对应的高清增强版本。"
                              description={
                                item.enhanced.status === "success"
                                  ? `输出格式：${
                                      item.enhanced.format || upscaleSettings.outputFormat
                                    }`
                                  : item.enhanced.retryCount > 0
                                    ? `已重试 ${item.enhanced.retryCount} 次`
                                    : "增强完成后会保留在这里，方便继续预览和下载。"
                              }
                              backgroundClassName="bg-white"
                              error={item.enhanced.error}
                              onPreview={
                                item.enhanced.image
                                  ? () =>
                                      openPreview(
                                        item.enhanced.image!,
                                        `独立处理 ${index + 1} 增强图`
                                      )
                                  : undefined
                              }
                            />
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </article>
              ) : null}

              {activeWorkspace === "free" ? (
                <FreeGenerationPanel
                  selectedModel={selectedGeminiModel}
                  onModelChange={setSelectedGeminiModel}
                  modelOptions={geminiImageModelOptions}
                  onPreview={openPreview}
                  onDownload={handleDownload}
                />
              ) : null}
            </div>

            <aside className="space-y-6">
              <article className="rounded-[2rem] border border-slate-200/80 bg-white/85 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                  当前入口
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                  {activeWorkspaceOption.label}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {activeWorkspaceOption.description}
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white">
                    {activeWorkspaceOption.metric}
                  </span>
                  {activeWorkspace !== "overview" ? (
                    <button
                      type="button"
                      onClick={() => setActiveWorkspace("overview")}
                      className="inline-flex items-center justify-center rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                    >
                      返回入口
                    </button>
                  ) : null}
                </div>
              </article>

              <article className="rounded-[2rem] border border-slate-200/80 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                      批次状态
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                      {isProcessing ? "换装处理中" : "等待开始"}
                    </h2>
                  </div>
                  <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white">
                    {progress}%
                  </span>
                </div>

                <div className="mt-6 h-3 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,_#f59e0b,_#ea580c)] transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>

                <dl className="mt-6 space-y-3 text-sm text-slate-600">
                  <div className="flex items-center justify-between">
                    <dt>当前模式</dt>
                    <dd className="font-semibold text-slate-950">
                      {selectedModeOption.shortTitle}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt>当前预计任务</dt>
                    <dd className="font-semibold text-slate-950">{plannedTaskCount}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt>最近批次任务</dt>
                    <dd className="font-semibold text-slate-950">
                      {processedTasks.length}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt>已处理</dt>
                    <dd className="font-semibold text-slate-950">{processedCount}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt>换装成功</dt>
                    <dd className="font-semibold text-slate-950">{successfulCount}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt>失败待重试</dt>
                    <dd className="font-semibold text-slate-950">{failedCount}</dd>
                  </div>
                </dl>

                {error ? (
                  <div className="mt-6 rounded-[1.5rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">
                    {error}
                  </div>
                ) : null}
              </article>

              <article className="rounded-[2rem] border border-slate-200/80 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                        换装引擎
                      </p>
                      <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                        {tryOnBackendLabel}
                      </h2>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${tryOnBackendStatusClass}`}
                    >
                      {tryOnBackendStatusLabel}
                    </span>
                  </div>

                  <p className="text-sm leading-6 text-slate-600">{tryOnEngineMessage}</p>

                  <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
                    当前配置：{tryOnBackendSummary}
                  </div>

                  <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                      换装模型
                    </p>
                    <div className="mt-3 grid gap-2">
                      {tryOnEngineOptions.map((option) => {
                        const isActive = option.value === selectedTryOnEngine;
                        const isUnavailable =
                          option.requiresFashn === true && isTryOnConfigured !== true;

                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => handleTryOnEngineChange(option.value)}
                            disabled={isUnavailable}
                            className={`rounded-2xl border px-4 py-3 text-left transition ${
                              isActive
                                ? "border-slate-950 bg-slate-950 text-white"
                                : isUnavailable
                                  ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-sm font-semibold">{option.label}</span>
                              <span
                                className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${
                                  isActive ? "text-white/80" : "text-slate-400"
                                }`}
                              >
                                {isActive ? "当前使用" : isUnavailable ? "需配置" : "可切换"}
                              </span>
                            </div>
                            <p
                              className={`mt-2 text-sm leading-6 ${
                                isActive ? "text-white/80" : "text-slate-500"
                              }`}
                            >
                              {option.description}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-3 text-xs leading-5 text-slate-500">
                      当前接口：{tryOnBackendEndpoint}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      这里控制换装链路；自由生图仍然使用下方工作区自己的 Gemini 模型设置。
                    </p>
                  </div>

                  {isFashnSelected && !tryOnBackendReady ? (
                    <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
                      配置 `FASHN_API_KEY` 后，这里就可以直接切到 FASHN Try-On Max；如果暂时没配好，也可以继续切换到 Nano Banana Pro 或 Image2 跑 Gemini 换装。
                    </div>
                  ) : null}
                </div>
              </article>

              {showPostProcessingTools ? (
                <article className="rounded-[2rem] border border-slate-200/80 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                        结果后处理
                      </p>
                      <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                        白底图与高清增强
                      </h2>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        换白底继续复用 `/api/gemini`，变清晰继续复用 `/api/upscale`。
                        {activeWorkspace !== "post"
                          ? " 现在这组参数也会在当前工作区直接显示，不用再来回切入口。"
                          : ""}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void handleWhiteBackgroundAll()}
                        disabled={successfulCount === 0 || isProcessing || isWhiteningAll}
                        className={`inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition ${
                          successfulCount === 0 || isProcessing || isWhiteningAll
                            ? "cursor-not-allowed bg-amber-100 text-amber-700"
                            : "bg-amber-300 text-slate-950 hover:bg-amber-200"
                        }`}
                      >
                        {isWhiteningAll ? "整批换白底中..." : "整批一键换白底"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleUpscaleAll()}
                        disabled={
                          successfulCount === 0 ||
                          isProcessing ||
                          isUpscalingAll ||
                          !canEnhance
                        }
                        className={`inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition ${
                          successfulCount === 0 ||
                          isProcessing ||
                          isUpscalingAll ||
                          !canEnhance
                            ? "cursor-not-allowed bg-slate-100 text-slate-400"
                            : "bg-slate-950 text-white hover:bg-slate-800"
                        }`}
                      >
                        {isUpscalingAll ? "整批变清晰中..." : "整批一键变清晰"}
                      </button>
                      {activeWorkspace !== "post" ? (
                        <button
                          type="button"
                          onClick={() => setActiveWorkspace("post")}
                          className="inline-flex items-center justify-center rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                        >
                          进入后处理工作区
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                        白底图进度
                      </p>
                      <p className="mt-3 text-3xl font-semibold text-slate-950">
                        {whiteBackgroundCount}
                        <span className="ml-2 text-sm font-medium text-slate-500">
                          / {successfulCount}
                        </span>
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        待处理 {pendingWhiteCount} 张。
                      </p>
                    </div>

                    <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                        增强图进度
                      </p>
                      <p className="mt-3 text-3xl font-semibold text-slate-950">
                        {enhancedCount}
                        <span className="ml-2 text-sm font-medium text-slate-500">
                          / {successfulCount}
                        </span>
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        待处理 {pendingEnhanceCount} 张。
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${
                        isUpscaleConfigured === null
                          ? "bg-slate-100 text-slate-500"
                          : canEnhance
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {isUpscaleConfigured === null
                        ? "检查中"
                        : canEnhance
                          ? "Replicate 已就绪"
                          : "缺少 Token"}
                    </span>
                    <p className="text-sm leading-6 text-slate-600">
                      {upscaleConfigMessage || "正在检查 Replicate 配置。"}
                    </p>
                  </div>

                  <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
                    当前增强参数：{enhancementSummary}
                  </div>

                  <div className="space-y-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                        增强模式
                      </p>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        {(["target", "factor"] as UpscaleMode[]).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => updateUpscaleSettings("upscaleMode", mode)}
                            className={`rounded-2xl border px-4 py-3 text-sm font-semibold capitalize transition ${
                              upscaleSettings.upscaleMode === mode
                                ? "border-slate-950 bg-slate-950 text-white"
                                : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
                            }`}
                          >
                            {mode === "target" ? "按目标分辨率" : "按放大倍数"}
                          </button>
                        ))}
                      </div>
                    </div>

                    {upscaleSettings.upscaleMode === "target" ? (
                      <label className="block">
                        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                          <span>目标分辨率</span>
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
                            {upscaleSettings.target} MP
                          </span>
                        </div>
                        <input
                          type="range"
                          min={1}
                          max={8}
                          step={1}
                          value={upscaleSettings.target}
                          onChange={(event) =>
                            updateUpscaleSettings("target", event.target.valueAsNumber)
                          }
                          className="mt-3 w-full accent-slate-950"
                        />
                      </label>
                    ) : (
                      <label className="block">
                        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                          <span>放大倍数</span>
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
                            {formatFactor(upscaleSettings.factor)}x
                          </span>
                        </div>
                        <input
                          type="range"
                          min={1}
                          max={8}
                          step={0.5}
                          value={upscaleSettings.factor}
                          onChange={(event) =>
                            updateUpscaleSettings("factor", event.target.valueAsNumber)
                          }
                          className="mt-3 w-full accent-slate-950"
                        />
                      </label>
                    )}

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block">
                        <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                          输出格式
                        </span>
                        <select
                          value={upscaleSettings.outputFormat}
                          onChange={(event) =>
                            updateUpscaleSettings(
                              "outputFormat",
                              event.target.value as UpscaleOutputFormat
                            )
                          }
                          className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-slate-950"
                        >
                          {formatOptions.map((format) => (
                            <option key={format} value={format}>
                              {format.toUpperCase()}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="block">
                        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                          <span>输出质量</span>
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
                            {upscaleSettings.outputQuality}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={1}
                          value={upscaleSettings.outputQuality}
                          onChange={(event) =>
                            updateUpscaleSettings(
                              "outputQuality",
                              event.target.valueAsNumber
                            )
                          }
                          className="mt-3 w-full accent-slate-950"
                        />
                      </label>
                    </div>

                    <div className="grid gap-3">
                      <label className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            细节增强
                          </p>
                          <p className="mt-1 text-sm leading-6 text-slate-500">
                            更强调衣服纹理、边缘和局部清晰度。
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={upscaleSettings.enhanceDetails}
                          onChange={(event) =>
                            updateUpscaleSettings(
                              "enhanceDetails",
                              event.target.checked
                            )
                          }
                          className="h-5 w-5 accent-slate-950"
                        />
                      </label>

                      <label className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            真实感增强
                          </p>
                          <p className="mt-1 text-sm leading-6 text-slate-500">
                            更偏向真实摄影质感，适合最终出图。
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={upscaleSettings.enhanceRealism}
                          onChange={(event) =>
                            updateUpscaleSettings(
                              "enhanceRealism",
                              event.target.checked
                            )
                          }
                          className="h-5 w-5 accent-slate-950"
                        />
                      </label>
                    </div>
                  </div>
                </div>
                </article>
              ) : null}

              {activeWorkspace !== "free" ? (
                <article className="rounded-[2rem] border border-slate-200/80 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                  使用提示
                </p>
                <ul className="mt-4 space-y-3 text-sm leading-7 text-slate-600">
                  {quickNotes.map((note) => (
                    <li key={note} className="flex items-start gap-3">
                      <span className="mt-2 h-2 w-2 rounded-full bg-amber-500" />
                      <span>{note}</span>
                    </li>
                  ))}
                </ul>
                </article>
              ) : null}

              {activeWorkspace === "try-on" &&
              generationMode === "multi-clothing-single-model" &&
              modelImages[0] ? (
                <article className="rounded-[2rem] border border-slate-200/80 bg-white/80 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
                  <div className="aspect-[4/5] overflow-hidden rounded-[1.5rem] border border-slate-200 bg-slate-100">
                    <img
                      src={modelImages[0]}
                      alt="当前固定模特图"
                      className="h-full w-full object-cover"
                      onClick={() => openPreview(modelImages[0], "当前固定模特图")}
                    />
                  </div>
                  <div className="px-2 pb-2 pt-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                      当前固定模特图
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      当前批次会让所有服装图都复用这张模特图。
                    </p>
                  </div>
                </article>
              ) : null}

              {activeWorkspace === "try-on" &&
              generationMode === "single-clothing-multi-model" &&
              clothingImages[0] ? (
                <article className="rounded-[2rem] border border-slate-200/80 bg-white/80 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
                  <div className="aspect-[4/5] overflow-hidden rounded-[1.5rem] border border-slate-200 bg-slate-100">
                    <img
                      src={clothingImages[0]}
                      alt="当前固定服装图"
                      className="h-full w-full object-cover"
                      onClick={() => openPreview(clothingImages[0], "当前固定服装图")}
                    />
                  </div>
                  <div className="px-2 pb-2 pt-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                      当前固定服装图
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      当前批次会让所有模特图都复用这张服装图。
                    </p>
                  </div>
                </article>
              ) : null}
            </aside>
          </section>

          {activeWorkspace === "results" ? (
            <section className="rounded-[2rem] border border-slate-200/80 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                  换装结果
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                  服装图、模特图、原换装图、白底图、增强图
                </h2>
              </div>
              <p className="text-sm text-slate-500">
                {hasResultCards
                  ? `最近批次模式：${resultModeLabel}。共 ${processedTasks.length} 张结果卡片，其中 ${successfulCount} 张换装成功，${whiteBackgroundCount} 张白底图，${enhancedCount} 张增强图。`
                  : "开始生成后，这里会按当前任务组合展示每张结果对应的服装图、模特图、模式、原换装图、白底图和增强图。"}
              </p>
            </div>

            {!hasResultCards ? (
              <div className="mt-6 rounded-[1.75rem] border border-dashed border-slate-300 bg-slate-50/80 px-6 py-12 text-center">
                <p className="text-lg font-semibold text-slate-900">还没有结果</p>
                <p className="mt-2 text-sm leading-7 text-slate-500">
                  先选择模式，再上传服装图和模特图，点击“开始当前模式生成”后，这里会按组合关系显示每张卡片。
                </p>
              </div>
            ) : (
              <div className="mt-6 grid gap-6 xl:grid-cols-2">
                {processedTasks.map((item, index) => (
                  <article
                    key={item.id}
                    className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_16px_44px_rgba(15,23,42,0.06)]"
                  >
                    <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                              结果 {index + 1}
                            </p>
                            <span className="inline-flex items-center rounded-full bg-slate-950 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
                              {getGenerationModeShortLabel(item.mode)}
                            </span>
                            <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-800">
                              {getTryOnGarmentScopeLabel(item.garmentScope)}
                            </span>
                            <span
                              className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${getStatusPillClass(
                                item.tryOn.status
                              )}`}
                            >
                              换装：{getStatusLabel(item.tryOn.status)}
                            </span>
                            <span
                              className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${getStatusPillClass(
                                item.whiteBackground.status
                              )}`}
                            >
                              白底：{getStatusLabel(item.whiteBackground.status)}
                            </span>
                            <span
                              className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${getStatusPillClass(
                                item.enhanced.status
                              )}`}
                            >
                              增强：{getStatusLabel(item.enhanced.status)}
                            </span>
                          </div>

                          <p className="text-sm leading-6 text-slate-600">
                            当前模式：{getGenerationModeLabel(item.mode)}
                          </p>
                          <p className="text-sm leading-6 text-slate-600">
                            对应组合：服装 {item.clothingIndex + 1} / {item.clothingTotal}
                            ，模特 {item.modelIndex + 1} / {item.modelTotal}
                          </p>
                          <p className="text-sm leading-6 text-slate-600">
                            换装范围：
                            <span className="font-medium text-slate-900">
                              {" "}
                              {getTryOnGarmentScopeLabel(item.garmentScope)}
                            </span>
                          </p>
                          <p className="text-sm leading-6 text-slate-600">
                            服装备注：
                            <span className="font-medium text-slate-900">
                              {" "}
                              {item.garmentNote || "未填写，按默认逻辑生成。"}
                            </span>
                          </p>
                          {item.tryOn.retryCount > 0 ? (
                            <p className="text-sm leading-6 text-slate-500">
                              本卡片已重试换装 {item.tryOn.retryCount} 次。
                            </p>
                          ) : null}
                          {item.tryOn.status === "processing" && item.tryOn.detail ? (
                            <p className="text-sm leading-6 text-slate-500">
                              {item.tryOn.detail}
                            </p>
                          ) : null}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {item.tryOn.status === "error" ? (
                            <button
                              type="button"
                              onClick={() => void handleRetryResult(index)}
                              className="inline-flex items-center justify-center rounded-full bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
                            >
                              重试当前组合
                            </button>
                          ) : null}

                          <button
                            type="button"
                            onClick={() => void handleWhiteBackgroundResult(index)}
                            disabled={
                              item.tryOn.status !== "success" ||
                              !item.tryOn.image ||
                              item.whiteBackground.status === "processing" ||
                              isWhiteningAll
                            }
                            className={`inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition ${
                              item.tryOn.status !== "success" ||
                              !item.tryOn.image ||
                              item.whiteBackground.status === "processing" ||
                              isWhiteningAll
                                ? "cursor-not-allowed bg-amber-100 text-amber-700"
                                : "bg-amber-300 text-slate-950 hover:bg-amber-200"
                            }`}
                          >
                            {getWhiteBackgroundButtonLabel(item.whiteBackground)}
                          </button>

                          <button
                            type="button"
                            onClick={() => void handleUpscaleResult(index)}
                            disabled={
                              item.tryOn.status !== "success" ||
                              !item.tryOn.image ||
                              item.enhanced.status === "processing" ||
                              isUpscalingAll ||
                              !canEnhance
                            }
                            className={`inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition ${
                              item.tryOn.status !== "success" ||
                              !item.tryOn.image ||
                              item.enhanced.status === "processing" ||
                              isUpscalingAll ||
                              !canEnhance
                                ? "cursor-not-allowed bg-slate-100 text-slate-400"
                                : "bg-slate-950 text-white hover:bg-slate-800"
                            }`}
                          >
                            {getEnhanceButtonLabel(item.enhanced, canEnhance)}
                          </button>

                          {item.tryOn.image ? (
                            <button
                              type="button"
                              onClick={() =>
                                void handleDownload(
                                  item.tryOn.image!,
                                  buildTaskFilename(
                                    item,
                                    "try-on",
                                    normalizeDownloadExtension(item.tryOn.format)
                                  )
                                )
                              }
                              className="inline-flex items-center justify-center rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                            >
                              下载换装图
                            </button>
                          ) : null}

                          {item.whiteBackground.image ? (
                            <button
                              type="button"
                              onClick={() =>
                                void handleDownload(
                                  item.whiteBackground.image!,
                                  buildTaskFilename(item, "white-background", "png")
                                )
                              }
                              className="inline-flex items-center justify-center rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                            >
                              下载白底图
                            </button>
                          ) : null}

                          {item.enhanced.image ? (
                            <button
                              type="button"
                              onClick={() =>
                                void handleDownload(
                                  item.enhanced.image!,
                                  buildTaskFilename(
                                    item,
                                    "enhanced",
                                    item.enhanced.format || upscaleSettings.outputFormat
                                  )
                                )
                              }
                              className="inline-flex items-center justify-center rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                            >
                              下载增强图
                            </button>
                          ) : null}
                        </div>
                      </div>

                      {item.tryOn.error ? (
                        <div className="rounded-[1.5rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">
                          {item.tryOn.error}
                        </div>
                      ) : null}
                    </div>

                    <div className="grid gap-px bg-slate-200 md:grid-cols-2 xl:grid-cols-5">
                      <PreviewTile
                        title="服装图"
                        image={item.clothingImage}
                        alt={`服装图 ${index + 1}`}
                        status="success"
                        emptyTitle="暂无服装图"
                        emptyDescription="当前卡片没有可展示的服装图。"
                        description={`服装 ${item.clothingIndex + 1} / ${item.clothingTotal}`}
                        backgroundClassName="bg-slate-50"
                        onPreview={() =>
                          openPreview(item.clothingImage, `结果 ${index + 1} 服装图`)
                        }
                      />

                      <PreviewTile
                        title="模特图"
                        image={item.modelImage}
                        alt={`模特图 ${index + 1}`}
                        status="success"
                        emptyTitle="暂无模特图"
                        emptyDescription="当前卡片没有可展示的模特图。"
                        description={`模特 ${item.modelIndex + 1} / ${item.modelTotal}`}
                        backgroundClassName="bg-white"
                        onPreview={() =>
                          openPreview(item.modelImage, `结果 ${index + 1} 模特图`)
                        }
                      />

                      <PreviewTile
                        title="原换装图"
                        image={item.tryOn.image}
                        alt={`换装结果 ${index + 1}`}
                        status={item.tryOn.status}
                        emptyTitle="还没有换装结果"
                        emptyDescription="这张图片尚未生成成功，可点击上方按钮重试当前组合。"
                        description="这张图是后续白底图和增强图的原始来源。"
                        backgroundClassName="bg-slate-50"
                        error={item.tryOn.status === "error" ? item.tryOn.error : null}
                        onPreview={
                          item.tryOn.image
                            ? () =>
                                openPreview(
                                  item.tryOn.image!,
                                  `结果 ${index + 1} 原换装图`
                                )
                            : undefined
                        }
                      />

                      <PreviewTile
                        title="白底图"
                        image={item.whiteBackground.image}
                        alt={`白底图 ${index + 1}`}
                        status={item.whiteBackground.status}
                        emptyTitle="还没有白底图"
                        emptyDescription="点击上方“一键换白底”后，这里会显示独立白底版本。"
                        description={
                          item.whiteBackground.retryCount > 0
                            ? `已重试 ${item.whiteBackground.retryCount} 次`
                            : "白底处理完成后，可预览并单独下载。"
                        }
                        backgroundClassName="bg-white"
                        error={item.whiteBackground.error}
                        onPreview={
                          item.whiteBackground.image
                            ? () =>
                                openPreview(
                                  item.whiteBackground.image!,
                                  `结果 ${index + 1} 白底图`
                                )
                            : undefined
                        }
                      />

                      <PreviewTile
                        title="增强图"
                        image={item.enhanced.image}
                        alt={`增强图 ${index + 1}`}
                        status={item.enhanced.status}
                        emptyTitle="还没有增强图"
                        emptyDescription="点击上方“一键变清晰”后，这里会显示高清增强版本。"
                        description={
                          item.enhanced.status === "success"
                            ? `输出格式：${
                                item.enhanced.format || upscaleSettings.outputFormat
                              }`
                            : item.enhanced.retryCount > 0
                              ? `已重试 ${item.enhanced.retryCount} 次`
                              : "增强成功后会保留独立输出格式与下载入口。"
                        }
                        backgroundClassName="bg-slate-50"
                        error={item.enhanced.error}
                        onPreview={
                          item.enhanced.image
                            ? () =>
                                openPreview(
                                  item.enhanced.image!,
                                  `结果 ${index + 1} 增强图`
                                )
                            : undefined
                        }
                      />
                    </div>
                  </article>
                ))}
              </div>
            )}
            </section>
          ) : null}
        </div>

        {previewImage ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm"
            onClick={() => setPreviewImage(null)}
          >
            <div className="relative max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-[1.75rem] border border-white/10 bg-slate-950 p-3 shadow-[0_24px_80px_rgba(15,23,42,0.5)]">
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="absolute right-5 top-5 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18 18 6M6 6l12 12"
                  />
                </svg>
              </button>

              <div className="px-4 pb-3 pt-2">
                <p className="pr-12 text-sm font-semibold text-white/80">
                  {previewImage.title}
                </p>
              </div>

              <img
                src={previewImage.src}
                alt={previewImage.title}
                className="max-h-[82vh] w-full rounded-[1.25rem] object-contain"
                onClick={(event) => event.stopPropagation()}
              />
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
