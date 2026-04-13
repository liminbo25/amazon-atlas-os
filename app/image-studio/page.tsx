"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useState } from "react";
import MultiImageUploader from "@/components/image-studio/MultiImageUploader";
import { StudioHeader } from "@/components/portal/studio-header";

type AsyncStatus = "idle" | "processing" | "success" | "error";
type UpscaleMode = "target" | "factor";
type UpscaleOutputFormat = "jpg" | "png" | "webp";

interface ImageTaskState {
  status: AsyncStatus;
  image?: string;
  error: string | null;
  format?: UpscaleOutputFormat;
}

interface ProcessedImage {
  clothing: string;
  model: string;
  garmentNote: string;
  status: AsyncStatus;
  result?: string;
  error: string | null;
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

const quickNotes = [
  "服装图尽量平整、主体完整，能明显减少换装与换白底时的误判。",
  "模特参考图建议只放一张稳定角度，本轮批量都会复用它。",
  "服装备注适合补充长度、袖型、领口、露肤范围等不要改变的细节。",
  "换装图、白底图、高清增强图会分别保留，可单独预览与下载。",
];

const formatOptions: UpscaleOutputFormat[] = ["jpg", "png", "webp"];

function createTaskState(): ImageTaskState {
  return {
    status: "idle",
    error: null,
  };
}

function createProcessedImage(
  clothing: string,
  model: string,
  garmentNote: string
): ProcessedImage {
  return {
    clothing,
    model,
    garmentNote,
    status: "idle",
    error: null,
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

function normalizeClientError(error: unknown, fallback: string) {
  if (error instanceof Error) {
    if (error.message === "Failed to fetch") {
      return "请求已发出，但浏览器没有拿到完整返回。请刷新后重试，或换一张更小的图片。";
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
  const [clothingImages, setClothingImages] = useState<string[]>([]);
  const [garmentNotes, setGarmentNotes] = useState<string[]>([]);
  const [modelImages, setModelImages] = useState<string[]>([]);
  const [standaloneImages, setStandaloneImages] = useState<string[]>([]);
  const [standaloneItems, setStandaloneItems] = useState<StandaloneImageItem[]>(
    []
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [isWhiteningAll, setIsWhiteningAll] = useState(false);
  const [isUpscalingAll, setIsUpscalingAll] = useState(false);
  const [processedImages, setProcessedImages] = useState<ProcessedImage[]>([]);
  const [processedCount, setProcessedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<PreviewState | null>(null);
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
    const controller = new AbortController();

    const loadUpscaleConfig = async () => {
      try {
        const response = await fetch("/api/upscale", {
          method: "GET",
          signal: controller.signal,
        });
        const data = (await response.json()) as ImageApiResponse & {
          configured?: boolean;
        };

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

  const hasUploads = clothingImages.length > 0 && modelImages.length > 0;
  const hasResultCards = processedImages.length > 0;
  const canEnhance = isUpscaleConfigured === true;
  const progress = clothingImages.length
    ? Math.round((processedCount / clothingImages.length) * 100)
    : 0;
  const successfulCount = processedImages.filter(
    (item) => item.status === "success" && Boolean(item.result)
  ).length;
  const failedCount = processedImages.filter((item) => item.status === "error").length;
  const whiteBackgroundCount = processedImages.filter(
    (item) => item.whiteBackground.status === "success" && item.whiteBackground.image
  ).length;
  const enhancedCount = processedImages.filter(
    (item) => item.enhanced.status === "success" && item.enhanced.image
  ).length;
  const pendingWhiteCount = processedImages.filter(
    (item) =>
      item.status === "success" &&
      item.result &&
      item.whiteBackground.status !== "success"
  ).length;
  const pendingEnhanceCount = processedImages.filter(
    (item) =>
      item.status === "success" &&
      item.result &&
      item.enhanced.status !== "success"
  ).length;
  const standaloneWhiteCount = standaloneItems.filter(
    (item) => item.whiteBackground.status === "success" && item.whiteBackground.image
  ).length;
  const standaloneEnhancedCount = standaloneItems.filter(
    (item) => item.enhanced.status === "success" && item.enhanced.image
  ).length;
  const enhancementSummary = describeUpscaleSettings(upscaleSettings);

  const updateUpscaleSettings = <Key extends keyof UpscaleSettings>(
    key: Key,
    value: UpscaleSettings[Key]
  ) => {
    setUpscaleSettings((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const updateProcessedImage = (
    index: number,
    updater: (current: ProcessedImage) => ProcessedImage
  ) => {
    setProcessedImages((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? updater(item) : item
      )
    );
  };

  const updateStandaloneItem = (
    index: number,
    updater: (current: StandaloneImageItem) => StandaloneImageItem
  ) => {
    setStandaloneItems((current) => {
      const nextItems = [...current];
      const fallbackSource = standaloneImages[index] ?? "";
      const baseItem = nextItems[index] ?? createStandaloneItem(fallbackSource);

      nextItems[index] = updater(baseItem);
      return nextItems;
    });
  };

  const openPreview = (src: string, title: string) => {
    setPreviewImage({ src, title });
  };

  const handleDownload = async (imageData: string, filename: string) => {
    try {
      let dataUrl = imageData;

      if (imageData.startsWith("http://") || imageData.startsWith("https://")) {
        const response = await fetch("/api/download", {
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
  };

  const readImageResponse = async (response: Response, actionLabel: string) => {
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
  };

  const requestTryOnImage = async (
    clothingImage: string,
    modelImage: string,
    garmentNote: string
  ) => {
    const response = await fetch("/api/gemini", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        clothingImage,
        modelImage,
        garmentNote,
        type: "virtual-tryon",
        size: "1024x1536",
      }),
    });

    return readImageResponse(response, "换装生成");
  };

  const requestWhiteBackgroundImage = async (image: string) => {
    const response = await fetch("/api/gemini", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image,
        type: "white-background",
        size: "1024x1024",
      }),
    });

    return readImageResponse(response, "换白底");
  };

  const requestUpscaledImage = async (
    image: string,
    settings: UpscaleSettings
  ) => {
    const response = await fetch("/api/upscale", {
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
  };

  const runTryOn = async (
    index: number,
    clothingImage: string,
    modelImage: string,
    garmentNote: string
  ) => {
    updateProcessedImage(index, () => ({
      ...createProcessedImage(clothingImage, modelImage, garmentNote),
      status: "processing",
    }));

    try {
      const result = await requestTryOnImage(clothingImage, modelImage, garmentNote);

      updateProcessedImage(index, (current) => ({
        ...current,
        status: "success",
        result,
        error: null,
      }));
    } catch (requestError) {
      const message = normalizeClientError(
        requestError,
        "换装生成失败，请稍后重试。"
      );

      updateProcessedImage(index, (current) => ({
        ...current,
        status: "error",
        result: undefined,
        error: message,
        whiteBackground: createTaskState(),
        enhanced: createTaskState(),
      }));
      setError(`第 ${index + 1} 张换装失败：${message}`);
    }
  };

  const handleStartProcessing = async () => {
    if (clothingImages.length === 0) {
      setError("请先上传至少一张服装图，再开始批量换装。");
      return;
    }

    if (modelImages.length === 0 || !modelImages[0]) {
      setError("请先上传一张模特参考图，再开始批量换装。");
      return;
    }

    const activeModel = modelImages[0];

    setError(null);
    setIsProcessing(true);
    setProcessedCount(0);
    setProcessedImages(
      clothingImages.map((clothingImage, index) =>
        createProcessedImage(clothingImage, activeModel, garmentNotes[index] ?? "")
      )
    );

    try {
      for (const [index, clothingImage] of clothingImages.entries()) {
        await runTryOn(index, clothingImage, activeModel, garmentNotes[index] ?? "");
        setProcessedCount(index + 1);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRetryResult = async (index: number) => {
    const item = processedImages[index];

    if (!item) {
      return;
    }

    setError(null);
    await runTryOn(index, item.clothing, item.model, item.garmentNote);
  };

  const handleWhiteBackgroundResult = async (index: number) => {
    const item = processedImages[index];

    if (!item?.result) {
      setError("请先生成换装图，再执行换白底。");
      return;
    }

    setError(null);
    updateProcessedImage(index, (current) => ({
      ...current,
      whiteBackground: {
        ...current.whiteBackground,
        status: "processing",
        error: null,
      },
    }));

    try {
      const result = await requestWhiteBackgroundImage(item.result);

      updateProcessedImage(index, (current) => ({
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
        "换白底失败，请稍后重试。"
      );

      updateProcessedImage(index, (current) => ({
        ...current,
        whiteBackground: {
          ...current.whiteBackground,
          status: "error",
          error: message,
        },
      }));
      setError(`第 ${index + 1} 张换白底失败：${message}`);
    }
  };

  const handleWhiteBackgroundAll = async () => {
    if (successfulCount === 0) {
      setError("请先生成至少一张成功的换装图，再执行整批换白底。");
      return;
    }

    const targetIndices = processedImages
      .map((item, itemIndex) => ({ item, itemIndex }))
      .filter(
        ({ item }) =>
          item.status === "success" &&
          item.result &&
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
  };

  const handleUpscaleResult = async (index: number) => {
    if (!canEnhance) {
      setError("请先配置 REPLICATE_API_TOKEN，再使用变清晰功能。");
      return;
    }

    const item = processedImages[index];

    if (!item?.result) {
      setError("请先生成换装图，再执行变清晰。");
      return;
    }

    const settingsPayload = { ...upscaleSettings };

    setError(null);
    updateProcessedImage(index, (current) => ({
      ...current,
      enhanced: {
        ...current.enhanced,
        status: "processing",
        error: null,
        format: settingsPayload.outputFormat,
      },
    }));

    try {
      const data = await requestUpscaledImage(item.result, settingsPayload);

      updateProcessedImage(index, (current) => ({
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

      updateProcessedImage(index, (current) => ({
        ...current,
        enhanced: {
          ...current.enhanced,
          status: "error",
          error: message,
          format: settingsPayload.outputFormat,
        },
      }));
      setError(`第 ${index + 1} 张变清晰失败：${message}`);
    }
  };

  const handleUpscaleAll = async () => {
    if (!canEnhance) {
      setError("请先配置 REPLICATE_API_TOKEN，再执行整批变清晰。");
      return;
    }

    if (successfulCount === 0) {
      setError("请先生成至少一张成功的换装图，再执行整批变清晰。");
      return;
    }

    const targetIndices = processedImages
      .map((item, itemIndex) => ({ item, itemIndex }))
      .filter(
        ({ item }) =>
          item.status === "success" &&
          item.result &&
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
  };

  const handleStandaloneWhiteBackground = async (
    index: number,
    sourceImage: string
  ) => {
    setError(null);
    updateStandaloneItem(index, (current) => ({
      ...current,
      whiteBackground: {
        ...current.whiteBackground,
        status: "processing",
        error: null,
      },
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
  };

  const handleStandaloneUpscale = async (index: number, sourceImage: string) => {
    if (!canEnhance) {
      setError("请先配置 REPLICATE_API_TOKEN，再使用变清晰功能。");
      return;
    }

    const settingsPayload = { ...upscaleSettings };

    setError(null);
    updateStandaloneItem(index, (current) => ({
      ...current,
      enhanced: {
        ...current.enhanced,
        status: "processing",
        error: null,
        format: settingsPayload.outputFormat,
      },
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
  };

  return (
    <div className="min-h-screen pb-10">
      <StudioHeader
        eyebrow="图片工坊"
        title="换装、换白底、变清晰，一页完成"
        description="这里沿用现有换装能力、white-background 模式与 Replicate 增强接口，把换装结果、白底图和高清增强图收在同一个工作区里。"
        badge="图片处理工作台"
      />

      <main className="page-shell mt-8">
        <div className="flex w-full flex-col gap-6">
          <section className="overflow-hidden rounded-[2rem] border border-white/70 bg-[linear-gradient(135deg,_rgba(15,23,42,0.96),_rgba(39,39,42,0.92))] p-6 text-white shadow-[0_32px_90px_rgba(15,23,42,0.24)] sm:p-8">
            <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl space-y-5">
                <div className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm text-white/75">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  批量换装 + 白底图 + 高清增强
                </div>
                <div className="space-y-4">
                  <h1 className="font-serif text-4xl tracking-[-0.04em] text-balance sm:text-5xl">
                    先做换装，再把满意的结果一键换白底、变清晰。
                  </h1>
                  <p className="max-w-2xl text-base leading-8 text-white/70 sm:text-lg">
                    同一页里完成服装上传、模特参考、服装备注、批量换装、整批后处理和单张重试。白底图与增强图都会和原换装图分开保留。
                  </p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
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
                    {isProcessing ? "批量换装中..." : "开始批量换装"}
                  </button>
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
                    白底图
                  </p>
                  <p className="mt-3 text-3xl font-semibold">{whiteBackgroundCount}</p>
                </div>
                <div className="rounded-[1.5rem] border border-white/10 bg-white/6 p-4">
                  <p className="text-xs uppercase tracking-[0.28em] text-white/40">
                    增强图
                  </p>
                  <p className="mt-3 text-3xl font-semibold">{enhancedCount}</p>
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
            <div className="space-y-6">
              <article className="rounded-[2rem] border border-slate-200/80 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
                <MultiImageUploader
                  images={clothingImages}
                  onImagesChange={setClothingImages}
                  title="服装图上传"
                  description="上传需要换装的服装图。每张图片都可以单独补充服装备注，批量换装时会一并提交。"
                  maxImages={10}
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
                        这段备注会跟随当前服装图进入换装请求，适合补充你不希望模型改动的细节。
                      </p>
                    </div>
                  )}
                />
              </article>

              <article className="rounded-[2rem] border border-slate-200/80 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
                <MultiImageUploader
                  images={modelImages}
                  onImagesChange={setModelImages}
                  title="模特参考图"
                  description="上传一张清晰、主体完整的模特参考图。当前批次默认复用第一张模特图。"
                  maxImages={1}
                />
              </article>

              <article className="rounded-[2rem] border border-slate-200/80 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
                <MultiImageUploader
                  images={standaloneImages}
                  onImagesChange={setStandaloneImages}
                  title="单独处理图片区"
                  description="不走换装流程，直接对现有图片单张一键换白底或变清晰。成功后会分别保留白底图和增强图。"
                  maxImages={10}
                  renderImageFooter={({ image, index }) => {
                    const item =
                      standaloneItems[index] ?? createStandaloneItem(image);

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
                            onClick={() =>
                              void handleStandaloneUpscale(index, image)
                            }
                            disabled={
                              item.enhanced.status === "processing" || !canEnhance
                            }
                            className={`inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition ${
                              item.enhanced.status === "processing" || !canEnhance
                                ? "cursor-not-allowed bg-slate-100 text-slate-400"
                                : "bg-slate-950 text-white hover:bg-slate-800"
                            }`}
                          >
                            {getEnhanceButtonLabel(item.enhanced, canEnhance)}
                          </button>
                        </div>

                        {item.whiteBackground.status === "success" ||
                        item.enhanced.status === "success" ? (
                          <div className="flex flex-wrap gap-2">
                            {item.whiteBackground.image ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    openPreview(
                                      item.whiteBackground.image!,
                                      `独立图片 ${index + 1} 白底图`
                                    )
                                  }
                                  className="inline-flex items-center justify-center rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                                >
                                  预览白底图
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleDownload(
                                      item.whiteBackground.image!,
                                      `standalone-${index + 1}-white-background.png`
                                    )
                                  }
                                  className="inline-flex items-center justify-center rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                                >
                                  下载白底图
                                </button>
                              </>
                            ) : null}

                            {item.enhanced.image ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    openPreview(
                                      item.enhanced.image!,
                                      `独立图片 ${index + 1} 增强图`
                                    )
                                  }
                                  className="inline-flex items-center justify-center rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                                >
                                  预览增强图
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleDownload(
                                      item.enhanced.image!,
                                      `standalone-${index + 1}-enhanced.${
                                        item.enhanced.format ||
                                        upscaleSettings.outputFormat
                                      }`
                                    )
                                  }
                                  className="inline-flex items-center justify-center rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                                >
                                  下载增强图
                                </button>
                              </>
                            ) : null}
                          </div>
                        ) : null}

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
            </div>

            <aside className="space-y-6">
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
                    <dt>总服装图</dt>
                    <dd className="font-semibold text-slate-950">{clothingImages.length}</dd>
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
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                        结果后处理
                      </p>
                      <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                        白底图与高清增强
                      </h2>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        换白底复用 `white-background`，变清晰复用 Replicate。生成成功后会在每张结果卡片中保留独立版本。
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void handleWhiteBackgroundAll()}
                        disabled={
                          successfulCount === 0 || isProcessing || isWhiteningAll
                        }
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
                        待处理 {pendingWhiteCount} 张。支持单张补做，也支持整批一键处理。
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
                        待处理 {pendingEnhanceCount} 张。增强结果会保留输出格式与下载按钮。
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

              {modelImages[0] ? (
                <article className="rounded-[2rem] border border-slate-200/80 bg-white/80 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
                  <div className="aspect-[4/5] overflow-hidden rounded-[1.5rem] border border-slate-200 bg-slate-100">
                    <img
                      src={modelImages[0]}
                      alt="模特参考图"
                      className="h-full w-full object-cover"
                      onClick={() =>
                        openPreview(modelImages[0], "当前批次模特参考图")
                      }
                    />
                  </div>
                  <div className="px-2 pb-2 pt-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                      当前模特参考图
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      当前批次会复用这张图做换装。更换后重新批量运行即可更新结果。
                    </p>
                  </div>
                </article>
              ) : null}
            </aside>
          </section>

          <section className="rounded-[2rem] border border-slate-200/80 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                  换装结果
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                  原换装图、白底图、增强图
                </h2>
              </div>
              <p className="text-sm text-slate-500">
                {hasResultCards
                  ? `共 ${processedImages.length} 张结果卡片，其中 ${successfulCount} 张换装成功，${whiteBackgroundCount} 张白底图，${enhancedCount} 张增强图。`
                  : "批量换装后，结果会在这里展示，并支持单张换白底、单张变清晰和失败项重试。"}
              </p>
            </div>

            {!hasResultCards ? (
              <div className="mt-6 rounded-[1.75rem] border border-dashed border-slate-300 bg-slate-50/80 px-6 py-12 text-center">
                <p className="text-lg font-semibold text-slate-900">还没有结果</p>
                <p className="mt-2 text-sm leading-7 text-slate-500">
                  上传服装图和模特图后点击“开始批量换装”，这里会出现每张图片的原换装图、白底图和增强图状态。
                </p>
              </div>
            ) : (
              <div className="mt-6 grid gap-6 xl:grid-cols-2">
                {processedImages.map((item, index) => (
                  <article
                    key={`${item.clothing.slice(0, 40)}-${index}`}
                    className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_16px_44px_rgba(15,23,42,0.06)]"
                  >
                    <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                              结果 {index + 1}
                            </p>
                            <span
                              className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${getStatusPillClass(
                                item.status
                              )}`}
                            >
                              换装：{getStatusLabel(item.status)}
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
                            流程关系：服装参考图 → 原换装图 → 白底图 / 增强图
                          </p>
                          <p className="text-sm leading-6 text-slate-600">
                            服装备注：
                            <span className="font-medium text-slate-900">
                              {" "}
                              {item.garmentNote || "未填写，按默认逻辑生成。"}
                            </span>
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {item.status === "error" ? (
                            <button
                              type="button"
                              onClick={() => void handleRetryResult(index)}
                              className="inline-flex items-center justify-center rounded-full bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
                            >
                              重试本张换装
                            </button>
                          ) : null}

                          <button
                            type="button"
                            onClick={() => void handleWhiteBackgroundResult(index)}
                            disabled={
                              item.status !== "success" ||
                              !item.result ||
                              item.whiteBackground.status === "processing" ||
                              isWhiteningAll
                            }
                            className={`inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition ${
                              item.status !== "success" ||
                              !item.result ||
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
                              item.status !== "success" ||
                              !item.result ||
                              item.enhanced.status === "processing" ||
                              isUpscalingAll ||
                              !canEnhance
                            }
                            className={`inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition ${
                              item.status !== "success" ||
                              !item.result ||
                              item.enhanced.status === "processing" ||
                              isUpscalingAll ||
                              !canEnhance
                                ? "cursor-not-allowed bg-slate-100 text-slate-400"
                                : "bg-slate-950 text-white hover:bg-slate-800"
                            }`}
                          >
                            {getEnhanceButtonLabel(item.enhanced, canEnhance)}
                          </button>

                          {item.result ? (
                            <button
                              type="button"
                              onClick={() =>
                                void handleDownload(
                                  item.result!,
                                  `try-on-result-${index + 1}.png`
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
                                  `try-on-result-${index + 1}-white-background.png`
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
                                  `try-on-result-${index + 1}-enhanced.${
                                    item.enhanced.format ||
                                    upscaleSettings.outputFormat
                                  }`
                                )
                              }
                              className="inline-flex items-center justify-center rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                            >
                              下载增强图
                            </button>
                          ) : null}
                        </div>
                      </div>

                      {item.error ? (
                        <div className="rounded-[1.5rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">
                          {item.error}
                        </div>
                      ) : null}
                    </div>

                    <div className="grid gap-px bg-slate-200 md:grid-cols-2 xl:grid-cols-4">
                      <PreviewTile
                        title="服装参考图"
                        image={item.clothing}
                        alt={`服装参考图 ${index + 1}`}
                        status="success"
                        emptyTitle="暂无服装图"
                        emptyDescription="当前卡片没有可展示的服装参考图。"
                        description="用于换装参考的原始服装图。"
                        backgroundClassName="bg-slate-50"
                        onPreview={() =>
                          openPreview(item.clothing, `结果 ${index + 1} 服装参考图`)
                        }
                      />

                      <PreviewTile
                        title="原换装图"
                        image={item.result}
                        alt={`换装结果 ${index + 1}`}
                        status={item.status}
                        emptyTitle="还没有换装结果"
                        emptyDescription="这张图片尚未生成成功，可点击上方按钮重试。"
                        description="这是当前卡片的原始换装图，后续白底图和增强图都与它对应。"
                        backgroundClassName="bg-white"
                        error={item.status === "error" ? item.error : null}
                        onPreview={
                          item.result
                            ? () =>
                                openPreview(item.result!, `结果 ${index + 1} 原换装图`)
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
                        description="白底处理完成后，可预览并单独下载。"
                        backgroundClassName="bg-slate-50"
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
                                item.enhanced.format ||
                                upscaleSettings.outputFormat
                              }`
                            : "增强成功后会保留独立输出格式与下载入口。"
                        }
                        backgroundClassName="bg-white"
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
