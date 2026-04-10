"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useState } from "react";
import MultiImageUploader from "@/components/image-studio/MultiImageUploader";
import { StudioHeader } from "@/components/portal/studio-header";

type UpscaleMode = "target" | "factor";
type UpscaleOutputFormat = "jpg" | "png" | "webp";

interface ProcessedImage {
  clothing: string;
  model: string;
  result: string;
  upscaledResult?: string;
  isUpscaling?: boolean;
  upscaleError?: string | null;
  upscaleFormat?: UpscaleOutputFormat;
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

const quickNotes = [
  "Use clean product shots with the garment fully visible.",
  "Upload one stable model reference for the whole batch.",
  "Lock the look first, then enhance the winners with the quality pass.",
];

const formatOptions: UpscaleOutputFormat[] = ["jpg", "png", "webp"];

async function getImageSize(
  src: string
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.width, height: image.height });
    image.onerror = reject;
    image.src = src;
  });
}

function formatFactor(value: number) {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
}

function describeUpscaleSettings(settings: UpscaleSettings) {
  const scaleLabel =
    settings.upscaleMode === "target"
      ? `${settings.target} MP target`
      : `${formatFactor(settings.factor)}x factor`;
  const enhancements = [
    settings.enhanceDetails ? "detail boost" : null,
    settings.enhanceRealism ? "realism boost" : null,
  ]
    .filter(Boolean)
    .join(" / ");

  return `${scaleLabel} / ${settings.outputFormat.toUpperCase()} / Q${settings.outputQuality}${
    enhancements ? ` / ${enhancements}` : ""
  }`;
}

export default function ClothingModelSwapPage() {
  const [clothingImages, setClothingImages] = useState<string[]>([]);
  const [modelImages, setModelImages] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isUpscalingAll, setIsUpscalingAll] = useState(false);
  const [processedImages, setProcessedImages] = useState<ProcessedImage[]>([]);
  const [processedCount, setProcessedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
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

  const hasUploads = clothingImages.length > 0 && modelImages.length > 0;
  const hasResults = processedImages.length > 0;
  const canEnhance = isUpscaleConfigured === true;
  const progress = clothingImages.length
    ? Math.round((processedCount / clothingImages.length) * 100)
    : 0;
  const enhancedCount = processedImages.filter((item) => item.upscaledResult).length;
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

  useEffect(() => {
    const controller = new AbortController();

    const loadUpscaleConfig = async () => {
      try {
        const response = await fetch("/api/upscale", {
          method: "GET",
          signal: controller.signal,
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error("Could not load the upscale configuration.");
        }

        setIsUpscaleConfigured(Boolean(data.configured));
        setUpscaleConfigMessage(
          data.configured
            ? "Replicate is ready for one-click enhancement."
            : "Add REPLICATE_API_TOKEN to .env.local to enable the quality pass."
        );
      } catch (configError) {
        if (controller.signal.aborted) {
          return;
        }

        setIsUpscaleConfigured(false);
        setUpscaleConfigMessage(
          configError instanceof Error
            ? configError.message
            : "Could not verify the upscale configuration."
        );
      }
    };

    void loadUpscaleConfig();

    return () => controller.abort();
  }, []);

  const handleDownload = async (imageData: string, filename: string) => {
    try {
      let dataUrl = imageData;

      if (imageData.startsWith("http://") || imageData.startsWith("https://")) {
        const response = await fetch("/api/download", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrl: imageData }),
        });

        const json = await response.json();

        if (!json.success) {
          throw new Error(json.error);
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
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "Download failed."
      );
    }
  };

  const handleStartProcessing = async () => {
    if (clothingImages.length === 0) {
      setError("Upload at least one garment image before running.");
      return;
    }

    if (modelImages.length === 0) {
      setError("Upload one model reference before running.");
      return;
    }

    setError(null);
    setIsProcessing(true);
    setProcessedImages([]);
    setProcessedCount(0);

    let targetSize: { width: number; height: number };

    try {
      const originalSize = await getImageSize(modelImages[0]);
      const targetLongSide = 2048;
      const longSide = Math.max(originalSize.width, originalSize.height);
      const scale = targetLongSide / longSide;

      targetSize =
        scale > 1
          ? {
              width: Math.round(originalSize.width * scale),
              height: Math.round(originalSize.height * scale),
            }
          : originalSize;
    } catch {
      setError("Could not read the model image size.");
      setIsProcessing(false);
      return;
    }

    const nextResults: ProcessedImage[] = [];

    for (const [index, clothingImage] of clothingImages.entries()) {
      try {
        const response = await fetch("/api/gemini", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            clothingImage,
            modelImage: modelImages[0],
            type: "virtual-tryon",
            size: `${targetSize.width}x${targetSize.height}`,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || `Request failed with ${response.status}`);
        }

        const data = await response.json();

        if (!data.success || !data.result) {
          throw new Error(data.error || "The try-on request did not return an image.");
        }

        if (
          !data.result.startsWith("data:image/") &&
          !data.result.startsWith("http")
        ) {
          throw new Error("The response format was not a valid image.");
        }

        const nextItem = {
          clothing: clothingImage,
          model: modelImages[0],
          result: data.result,
        };

        nextResults.push(nextItem);
        setProcessedImages([...nextResults]);
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "One of the garment runs failed."
        );
      } finally {
        setProcessedCount(index + 1);
      }
    }

    setIsProcessing(false);
  };

  const handleUpscaleResult = async (index: number) => {
    if (!canEnhance) {
      setError("Add REPLICATE_API_TOKEN to .env.local before enhancing images.");
      return;
    }

    const sourceItem = processedImages[index];

    if (!sourceItem) {
      return;
    }

    const settingsPayload = { ...upscaleSettings };

    setError(null);
    updateProcessedImage(index, (current) => ({
      ...current,
      isUpscaling: true,
      upscaleError: null,
    }));

    try {
      const response = await fetch("/api/upscale", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image: sourceItem.result,
          settings: settingsPayload,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success || !data.result) {
        throw new Error(data.error || `Upscale request failed with ${response.status}`);
      }

      if (
        !data.result.startsWith("data:image/") &&
        !data.result.startsWith("http")
      ) {
        throw new Error("The enhanced image response was not valid.");
      }

      updateProcessedImage(index, (current) => ({
        ...current,
        isUpscaling: false,
        upscaledResult: data.result,
        upscaleError: null,
        upscaleFormat: settingsPayload.outputFormat,
      }));
    } catch (upscaleError) {
      const message =
        upscaleError instanceof Error
          ? upscaleError.message
          : "Quality enhancement failed.";

      updateProcessedImage(index, (current) => ({
        ...current,
        isUpscaling: false,
        upscaleError: message,
      }));
      setError(message);
    }
  };

  const handleUpscaleAll = async () => {
    if (!canEnhance) {
      setError("Add REPLICATE_API_TOKEN to .env.local before enhancing images.");
      return;
    }

    if (!processedImages.length) {
      setError("Run the try-on batch before enhancing results.");
      return;
    }

    const targetIndices = processedImages
      .map((item, itemIndex) => ({ item, itemIndex }))
      .filter(({ item }) => !item.upscaledResult)
      .map(({ itemIndex }) => itemIndex);

    if (!targetIndices.length) {
      setError("All current results already have an enhanced export.");
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

  return (
    <div className="min-h-screen pb-10">
      <StudioHeader
        eyebrow="图片工坊"
        title="把服装图、模特参考图和超分增强流程，收在一个更适合生产使用的图片工坊里。"
        description="这个模块沿用你已经可用的批量试穿与 Replicate 增强能力，只是现在被纳入统一门户，后面再加抠图、背景替换、海报生成也会更顺。"
      />

      <main className="page-shell mt-8">
        <div className="flex w-full flex-col gap-6">
        <section className="overflow-hidden rounded-[2rem] border border-white/70 bg-[linear-gradient(135deg,_rgba(15,23,42,0.96),_rgba(39,39,42,0.92))] p-6 text-white shadow-[0_32px_90px_rgba(15,23,42,0.24)] sm:p-8">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-5">
              <div className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm text-white/75">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                Batch virtual try-on
              </div>
              <div className="space-y-4">
                <h1 className="font-serif text-4xl tracking-[-0.04em] text-balance sm:text-5xl">
                  Run the look, then push the best frames through a Replicate quality pass.
                </h1>
                <p className="max-w-2xl text-base leading-8 text-white/70 sm:text-lg">
                  This workspace keeps the try-on run simple: upload garments, add
                  one model reference, generate the batch, then upscale the keepers
                  with `prunaai/p-image-upscale` before download.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={handleStartProcessing}
                  disabled={!hasUploads || isProcessing}
                  className={`inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold transition ${
                    !hasUploads || isProcessing
                      ? "cursor-not-allowed bg-white/10 text-white/40"
                      : "bg-amber-300 text-slate-950 hover:bg-amber-200"
                  }`}
                >
                  {isProcessing ? "Running batch..." : "Run try-on batch"}
                </button>
                <Link
                  href="/"
                  className="inline-flex items-center justify-center rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  Back to dashboard
                </Link>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-4 lg:w-[38rem]">
              <div className="rounded-[1.5rem] border border-white/10 bg-white/6 p-4">
                <p className="text-xs uppercase tracking-[0.28em] text-white/40">
                  Garments
                </p>
                <p className="mt-3 text-3xl font-semibold">{clothingImages.length}</p>
              </div>
              <div className="rounded-[1.5rem] border border-white/10 bg-white/6 p-4">
                <p className="text-xs uppercase tracking-[0.28em] text-white/40">
                  Model refs
                </p>
                <p className="mt-3 text-3xl font-semibold">{modelImages.length}</p>
              </div>
              <div className="rounded-[1.5rem] border border-white/10 bg-white/6 p-4">
                <p className="text-xs uppercase tracking-[0.28em] text-white/40">
                  Results
                </p>
                <p className="mt-3 text-3xl font-semibold">{processedImages.length}</p>
              </div>
              <div className="rounded-[1.5rem] border border-white/10 bg-white/6 p-4">
                <p className="text-xs uppercase tracking-[0.28em] text-white/40">
                  Enhanced
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
                title="Garment inputs"
                description="Upload clean garment references. The current backend will run them one by one against the same model image."
                maxImages={10}
              />
            </article>

            <article className="rounded-[2rem] border border-slate-200/80 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
              <MultiImageUploader
                images={modelImages}
                onImagesChange={setModelImages}
                title="Model reference"
                description="Upload one stable reference with a clear pose and visible body shape. The batch reuses the first model image only."
                maxImages={1}
              />
            </article>
          </div>

          <aside className="space-y-6">
            <article className="rounded-[2rem] border border-slate-200/80 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                    Batch status
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                    {isProcessing ? "Processing" : "Ready"}
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
                  <dt>Total garments</dt>
                  <dd className="font-semibold text-slate-950">{clothingImages.length}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt>Processed</dt>
                  <dd className="font-semibold text-slate-950">{processedCount}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt>Successful</dt>
                  <dd className="font-semibold text-slate-950">{processedImages.length}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt>Enhanced</dt>
                  <dd className="font-semibold text-slate-950">{enhancedCount}</dd>
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
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                        Quality pass
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                      Replicate upscale
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      `prunaai/p-image-upscale` is wired in for one-click enhancement
                      after the try-on run.
                    </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleUpscaleAll()}
                      disabled={!hasResults || isProcessing || isUpscalingAll || !canEnhance}
                      className={`inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition ${
                      !hasResults || isProcessing || isUpscalingAll || !canEnhance
                        ? "cursor-not-allowed bg-slate-100 text-slate-400"
                        : "bg-slate-950 text-white hover:bg-slate-800"
                    }`}
                  >
                    {isUpscalingAll ? "Enhancing all..." : "Enhance all results"}
                  </button>
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
                      ? "Checking config"
                      : canEnhance
                        ? "Replicate ready"
                        : "Token required"}
                  </span>
                  <p className="text-sm leading-6 text-slate-600">
                    {upscaleConfigMessage || "Checking the Replicate connection."}
                  </p>
                </div>

                <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
                  {enhancementSummary}
                </div>

                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                      Upscale mode
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
                          {mode}
                        </button>
                      ))}
                    </div>
                  </div>

                  {upscaleSettings.upscaleMode === "target" ? (
                    <label className="block">
                      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                        <span>Target resolution</span>
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
                        <span>Scale factor</span>
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
                        Output format
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
                        <span>Output quality</span>
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
                          Enhance details
                        </p>
                        <p className="mt-1 text-sm leading-6 text-slate-500">
                          Push texture and garment edge definition harder.
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
                          Enhance realism
                        </p>
                        <p className="mt-1 text-sm leading-6 text-slate-500">
                          Bias the upscale toward a more photographic finish.
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
                Run notes
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
                <div className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-slate-100">
                  <img
                    src={modelImages[0]}
                    alt="Model reference"
                    className="aspect-[4/5] w-full object-cover"
                    onClick={() => setPreviewImage(modelImages[0])}
                  />
                </div>
                <div className="px-2 pb-2 pt-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                    Active model reference
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    This image is reused for every garment in the current run.
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
                Outputs
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                Generated results
              </h2>
            </div>
            <p className="text-sm text-slate-500">
              {processedImages.length === 0
                ? "Results will appear here after your first run."
                : `${processedImages.length} result${processedImages.length > 1 ? "s" : ""} ready. ${enhancedCount} enhanced.`}
            </p>
          </div>

          {processedImages.length === 0 ? (
            <div className="mt-6 rounded-[1.75rem] border border-dashed border-slate-300 bg-slate-50/80 px-6 py-12 text-center">
              <p className="text-lg font-semibold text-slate-900">No results yet</p>
              <p className="mt-2 text-sm leading-7 text-slate-500">
                Add garment and model images, then run the batch to populate this review area.
              </p>
            </div>
          ) : (
            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              {processedImages.map((item, index) => (
                <article
                  key={`${item.result.slice(0, 40)}-${index}`}
                  className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_16px_44px_rgba(15,23,42,0.06)]"
                >
                  <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                        Look {index + 1}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        Review the garment, the try-on result, and the enhanced export.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void handleUpscaleResult(index)}
                        disabled={item.isUpscaling || isUpscalingAll || !canEnhance}
                        className={`inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition ${
                          item.isUpscaling || isUpscalingAll || !canEnhance
                            ? "cursor-not-allowed bg-amber-100 text-amber-700"
                            : "bg-amber-300 text-slate-950 hover:bg-amber-200"
                        }`}
                      >
                        {item.isUpscaling
                          ? "Enhancing..."
                          : canEnhance
                            ? "Enhance quality"
                            : "Token required"}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleDownload(item.result, `try-on-result-${index + 1}.png`)
                        }
                        className="inline-flex items-center justify-center rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                      >
                        Download try-on
                      </button>
                      {item.upscaledResult ? (
                        <button
                          type="button"
                          onClick={() =>
                            handleDownload(
                              item.upscaledResult!,
                              `try-on-result-${index + 1}-upscaled.${
                                item.upscaleFormat || upscaleSettings.outputFormat
                              }`
                            )
                          }
                          className="inline-flex items-center justify-center rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                        >
                          Download enhanced
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid gap-px bg-slate-200 lg:grid-cols-3">
                    <button
                      type="button"
                      onClick={() => setPreviewImage(item.clothing)}
                      className="bg-slate-50 p-4 text-left transition hover:bg-slate-100"
                    >
                      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                        Garment
                      </p>
                      <div className="overflow-hidden rounded-[1.25rem] bg-white">
                        <img
                          src={item.clothing}
                          alt={`Garment ${index + 1}`}
                          className="aspect-[4/5] w-full object-cover"
                        />
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPreviewImage(item.result)}
                      className="bg-white p-4 text-left transition hover:bg-slate-50"
                    >
                      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                        Try-on
                      </p>
                      <div className="overflow-hidden rounded-[1.25rem] bg-slate-50">
                        <img
                          src={item.result}
                          alt={`Try-on result ${index + 1}`}
                          className="aspect-[4/5] w-full object-cover"
                        />
                      </div>
                    </button>

                    {item.upscaledResult ? (
                      <button
                        type="button"
                        onClick={() => setPreviewImage(item.upscaledResult!)}
                        className="bg-slate-50 p-4 text-left transition hover:bg-white"
                      >
                        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                          Enhanced
                        </p>
                        <div className="overflow-hidden rounded-[1.25rem] bg-white">
                          <img
                            src={item.upscaledResult}
                            alt={`Enhanced result ${index + 1}`}
                            className="aspect-[4/5] w-full object-cover"
                          />
                        </div>
                        <p className="mt-3 text-sm leading-6 text-slate-500">
                          {item.upscaleFormat?.toUpperCase() || upscaleSettings.outputFormat.toUpperCase()} export ready.
                        </p>
                      </button>
                    ) : (
                      <div className="bg-slate-50 p-4">
                        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                          Enhanced
                        </p>
                        <div className="flex aspect-[4/5] items-center justify-center rounded-[1.25rem] border border-dashed border-slate-300 bg-white px-5 text-center">
                          <div>
                            <p className="text-base font-semibold text-slate-900">
                              {item.isUpscaling
                                ? "Enhancement in progress"
                                : "No enhanced export yet"}
                            </p>
                            <p className="mt-2 text-sm leading-6 text-slate-500">
                              {item.isUpscaling
                                ? "Replicate is generating the higher-quality version now."
                                : "Run the quality pass to produce a sharper downloadable output."}
                            </p>
                          </div>
                        </div>
                        <p className="mt-3 text-sm leading-6 text-slate-500">
                          {enhancementSummary}
                        </p>
                        {item.upscaleError ? (
                          <p className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm leading-6 text-rose-700">
                            {item.upscaleError}
                          </p>
                        ) : null}
                      </div>
                    )}
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
            <img
              src={previewImage}
              alt="Preview"
              className="max-h-[86vh] w-full rounded-[1.25rem] object-contain"
              onClick={(event) => event.stopPropagation()}
            />
          </div>
        </div>
      ) : null}
      </main>
    </div>
  );
}
