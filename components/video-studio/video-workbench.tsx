"use client";

/* eslint-disable @next/next/no-img-element */

import { startTransition, useDeferredValue, useEffect, useState } from "react";
import {
  buildDurationOptions,
  createVideoGenerationDraft,
  normalizeCopyPlanPayload,
  normalizeManifestPayload,
  normalizeVideoModelListPayload,
  normalizeVideoTaskPayload,
  syncVideoGenerationDraft,
  type CopyPlan,
  type VideoGenerationDraft,
  type VideoGenerationTask,
  type VideoInputMode,
  type VideoManifest,
  type VideoModelCapability,
  type VideoModelParameterKey,
} from "@/lib/video-studio";
import {
  VideoRuntimeConfigPanel,
  type VideoServerRuntimeStatus,
} from "@/components/video-studio/video-runtime-config-panel";
import { useVideoRuntimeStore } from "@/lib/video-runtime-store";

const legacyVideoApiBaseUrl =
  process.env.NEXT_PUBLIC_VIDEO_API_BASE_URL?.replace(/\/$/, "") ?? "";
const useLegacyVideoApi = Boolean(legacyVideoApiBaseUrl);
const videoApiLabel = useLegacyVideoApi
  ? legacyVideoApiBaseUrl
  : "Next.js /api/video-studio";
const videoApiRoutes = useLegacyVideoApi
  ? {
      health: "/api/health",
      models: "/api/video-models",
      tasks: "/api/video-generation/tasks",
      upload: "/api/upload-video",
      copy: "/api/generate-copy",
    }
  : {
      health: "/api/video-studio/health",
      models: "/api/video-studio/models",
      tasks: "/api/video-studio/generation/tasks",
      upload: "/api/video-studio/upload-video",
      copy: "/api/video-studio/generate-copy",
    };

function videoApiUrl(path: string) {
  return useLegacyVideoApi ? `${legacyVideoApiBaseUrl}${path}` : path;
}

async function readVideoApiError(response: Response) {
  const errorPayload = (await response.json().catch(() => null)) as
    | { detail?: string; error?: string }
    | null;

  return errorPayload?.detail ?? errorPayload?.error ?? `HTTP ${response.status}`;
}

function readVideoServerRuntimeStatus(value: unknown): VideoServerRuntimeStatus | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const llm =
    record.llm && typeof record.llm === "object" && !Array.isArray(record.llm)
      ? (record.llm as Record<string, unknown>)
      : null;

  if (!llm) {
    return null;
  }

  const provider = llm.provider;
  const source = llm.source;
  const storage = llm.storage;

  if (
    provider !== null &&
    provider !== undefined &&
    provider !== "anthropic" &&
    provider !== "openai"
  ) {
    return null;
  }

  if (source !== "file" && source !== "env" && source !== "none") {
    return null;
  }

  if (storage !== "local-file" && storage !== "vercel-tmp") {
    return null;
  }

  return {
    configured: Boolean(llm.configured),
    provider:
      provider === "anthropic" || provider === "openai" ? provider : null,
    base_url: typeof llm.base_url === "string" ? llm.base_url : "",
    model: typeof llm.model === "string" ? llm.model : "",
    timeout_seconds:
      typeof llm.timeout_seconds === "number" ? llm.timeout_seconds : 120,
    has_api_key: Boolean(llm.has_api_key),
    api_key_masked:
      typeof llm.api_key_masked === "string" ? llm.api_key_masked : "",
    source,
    storage,
    config_error:
      typeof llm.config_error === "string" ? llm.config_error : null,
  };
}

function describeBackendRuntimeStatus(status: VideoServerRuntimeStatus | null): {
  state: "online" | "unconfigured";
  message: string;
} {
  if (!status) {
    return {
      state: "online",
      message: "视频 API 已联通，可以开始拆解与视频生成。",
    };
  }

  if (status.configured) {
    const provider =
      status.provider === "openai"
        ? "OpenAI"
        : status.provider === "anthropic"
          ? "Anthropic"
          : "Auto";
    const model = status.model || "shared default";

    return {
      state: "online",
      message: `视频 API 已联通，服务端默认 AI 运行时已配置：${provider} / ${model}。`,
    };
  }

  return {
    state: "unconfigured",
    message:
      status.config_error ||
      "视频 API 已联通，但服务端默认 AI 运行时尚未配置。你仍可以在下方 Runtime 面板填写浏览器覆盖配置，或保存一套共享默认值。",
  };
}

const numericParameterKeys: VideoModelParameterKey[] = [
  "motion_strength",
  "camera_strength",
  "style_strength",
];

const modeLabels: Record<VideoInputMode, string> = {
  text_to_video: "文生视频",
  image_to_video: "单图生视频",
  frame_to_video: "首尾帧视频",
  multi_image_to_video: "多图参考视频",
};

function formatDateTime(value: string) {
  if (!value) {
    return "未记录";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("zh-CN", { hour12: false });
}

function formatSeconds(value: number) {
  if (!Number.isFinite(value)) {
    return "0s";
  }

  if (value < 60) {
    return `${value.toFixed(0)}s`;
  }

  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value % 60);
  return `${minutes}m ${seconds}s`;
}

function formatConfidence(value: number) {
  return `${Math.round(value * 100)}%`;
}

function statusTone(status: string) {
  switch (status) {
    case "online":
      return "obsidian-meta-pill border-emerald-400/20 bg-emerald-500/12 text-emerald-100";
    case "offline":
      return "obsidian-meta-pill border-rose-400/20 bg-rose-500/12 text-rose-100";
    case "checking":
      return "obsidian-meta-pill border-amber-400/20 bg-amber-500/12 text-amber-100";
    case "unconfigured":
      return "obsidian-meta-pill bg-[rgba(255,255,255,0.04)] text-[#d7cabd]";
    default:
      return "obsidian-meta-pill bg-[rgba(255,255,255,0.04)] text-[#d7cabd]";
  }
}

function stageTone(stage: string) {
  switch (stage) {
    case "stop":
      return "obsidian-meta-pill border-rose-400/20 bg-rose-500/12 text-rose-100";
    case "pain":
      return "obsidian-meta-pill border-amber-400/20 bg-amber-500/12 text-amber-100";
    case "solution":
      return "obsidian-meta-pill border-sky-400/20 bg-sky-500/12 text-sky-100";
    case "trust":
      return "obsidian-meta-pill border-emerald-400/20 bg-emerald-500/12 text-emerald-100";
    case "buy":
      return "obsidian-meta-pill border-violet-400/20 bg-violet-500/12 text-violet-100";
    default:
      return "obsidian-meta-pill bg-[rgba(255,255,255,0.04)] text-[#d7cabd]";
  }
}

function createEmptyCopyForm(transcript = "") {
  return {
    productName: "",
    category: "",
    market: "US",
    audience: "",
    problem: "",
    sellingPoints: "",
    transcript,
    tone: "直接转化",
    desiredLength: "30-45 秒",
    proofAssets: "",
    heroAngle: "",
  };
}

function buildTaskPayload(model: VideoModelCapability, draft: VideoGenerationDraft) {
  const payload: Record<string, unknown> = {
    model_id: model.id,
    input_mode: draft.inputMode,
    prompt: draft.prompt.trim(),
    aspect_ratio: draft.aspectRatio,
    duration_seconds: draft.durationSeconds,
    quality: draft.quality,
  };

  if (
    model.supportedParameters.some((parameter) => parameter.key === "negative_prompt") &&
    draft.negativePrompt.trim()
  ) {
    payload.negative_prompt = draft.negativePrompt.trim();
  }

  if (
    model.supportedParameters.some((parameter) => parameter.key === "seed") &&
    draft.seed.trim()
  ) {
    payload.seed = Number(draft.seed);
  }

  if (
    model.supportedParameters.some((parameter) => parameter.key === "motion_strength") &&
    draft.motionStrength !== null
  ) {
    payload.motion_strength = draft.motionStrength;
  }

  if (
    model.supportedParameters.some((parameter) => parameter.key === "camera_strength") &&
    draft.cameraStrength !== null
  ) {
    payload.camera_strength = draft.cameraStrength;
  }

  if (
    model.supportedParameters.some((parameter) => parameter.key === "style_strength") &&
    draft.styleStrength !== null
  ) {
    payload.style_strength = draft.styleStrength;
  }

  return payload;
}

export function VideoWorkbench() {
  const { aiRuntimeSettings } = useVideoRuntimeStore();
  const [backendStatus, setBackendStatus] = useState<
    "checking" | "online" | "offline" | "unconfigured"
  >("checking");
  const [backendMessage, setBackendMessage] = useState(
    useLegacyVideoApi
      ? "Loading legacy video API..."
      : "Loading Next.js video API.",
  );

  const [models, setModels] = useState<VideoModelCapability[]>([]);
  const [selectedModelId, setSelectedModelId] = useState("");
  const [draft, setDraft] = useState<VideoGenerationDraft>(
    createVideoGenerationDraft(),
  );
  const [assetFiles, setAssetFiles] = useState<Record<string, File[]>>({});
  const [latestTask, setLatestTask] = useState<VideoGenerationTask | null>(null);
  const [taskMessage, setTaskMessage] = useState(
    "选择模型、填写参数并创建视频生成任务。",
  );
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);
  const [isRefreshingTask, setIsRefreshingTask] = useState(false);

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [analysisInterval, setAnalysisInterval] = useState(110);
  const [analysisFrames, setAnalysisFrames] = useState(6);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisMessage, setAnalysisMessage] = useState(
    "上传视频后，可以直接在这里做拆解与脚本重构。",
  );
  const [manifestRaw, setManifestRaw] = useState<Record<string, unknown> | null>(null);
  const [manifest, setManifest] = useState<VideoManifest | null>(null);

  const [copyForm, setCopyForm] = useState(createEmptyCopyForm());
  const deferredTranscript = useDeferredValue(copyForm.transcript);
  const [copyPlan, setCopyPlan] = useState<CopyPlan | null>(null);
  const [copyMessage, setCopyMessage] = useState(
    "拆解完成后，可以基于视频结构直接生成新的带货脚本。",
  );
  const [isGeneratingCopy, setIsGeneratingCopy] = useState(false);

  const selectedModel =
    models.find((item) => item.id === selectedModelId) ?? models[0];
  const selectedMode =
    selectedModel?.supportedInputModes.find((mode) => mode.mode === draft.inputMode) ??
    selectedModel?.supportedInputModes[0];
  const durationOptions = buildDurationOptions(selectedModel);

  useEffect(() => {
    let cancelled = false;

    async function loadModels() {
      setBackendStatus("checking");
      setBackendMessage(
        useLegacyVideoApi
          ? "Loading legacy video API..."
          : "Loading Next.js video API.",
      );

      try {
        const response = await fetch(videoApiUrl(videoApiRoutes.models));
        if (!response.ok) {
          throw new Error(await readVideoApiError(response));
        }

        const payload = await response.json();
        const nextModels = normalizeVideoModelListPayload(payload);
        if (!nextModels.length) {
          throw new Error("视频 API 没有返回可用的模型能力。");
        }

        let runtimeStatus: VideoServerRuntimeStatus | null = null;
        if (!useLegacyVideoApi) {
          try {
            const healthResponse = await fetch(videoApiUrl(videoApiRoutes.health), {
              cache: "no-store",
            });
            if (healthResponse.ok) {
              runtimeStatus = readVideoServerRuntimeStatus(
                (await healthResponse.json()) as unknown
              );
            }
          } catch {
            runtimeStatus = null;
          }
        }

        if (cancelled) {
          return;
        }

        const nextBackendStatus = useLegacyVideoApi
          ? {
              state: "online" as const,
              message: "视频 API 已联通，可以开始拆解与视频生成。",
            }
          : describeBackendRuntimeStatus(runtimeStatus);

        startTransition(() => {
          setModels(nextModels);
          setSelectedModelId(nextModels[0].id);
          setDraft(createVideoGenerationDraft(nextModels[0]));
          setBackendStatus(nextBackendStatus.state);
          setBackendMessage("视频 API 已联通，可以开始拆解与视频生成。");
          setBackendMessage(nextBackendStatus.message);
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        setBackendStatus("offline");
        setBackendMessage(
          error instanceof Error
            ? error.message
            : "视频 API 暂时无法连接。",
        );
      }
    }

    void loadModels();

    return () => {
      cancelled = true;
    };
  }, []);

  function handleServerStatusChange(status: VideoServerRuntimeStatus | null) {
    if (useLegacyVideoApi) {
      return;
    }

    const nextStatus = describeBackendRuntimeStatus(status);
    setBackendStatus(nextStatus.state);
    setBackendMessage(nextStatus.message);
  }

  function updateDraft<K extends keyof VideoGenerationDraft>(
    key: K,
    value: VideoGenerationDraft[K],
  ) {
    setDraft((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function updateCopyForm<K extends keyof typeof copyForm>(
    key: K,
    value: (typeof copyForm)[K],
  ) {
    setCopyForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function updateSlotFiles(slotId: string, files: FileList | null) {
    setAssetFiles((current) => ({
      ...current,
      [slotId]: files ? Array.from(files) : [],
    }));
  }

  function handleSelectModel(modelId: string) {
    const nextModel = models.find((item) => item.id === modelId);
    if (!nextModel) {
      return;
    }

    startTransition(() => {
      setSelectedModelId(modelId);
      setDraft((current) => syncVideoGenerationDraft(current, nextModel));
      setAssetFiles({});
      setTaskMessage(`已切换到 ${nextModel.name}，表单按该模型能力更新。`);
    });
  }

  async function handleRefreshTask(taskId: string) {
    setIsRefreshingTask(true);
    try {
      const response = await fetch(
        videoApiUrl(`${videoApiRoutes.tasks}/${taskId}`),
      );
      if (!response.ok) {
        throw new Error(await readVideoApiError(response));
      }

      const payload = await response.json();
      const task = normalizeVideoTaskPayload(payload);
      if (!task) {
        throw new Error("任务状态返回格式不正确。");
      }

      startTransition(() => {
        setLatestTask(task);
        setBackendStatus("online");
        setTaskMessage(`任务 ${task.taskId} 状态已刷新：${task.statusLabel}`);
      });
    } catch (error) {
      setBackendStatus("offline");
      setTaskMessage(
        error instanceof Error ? error.message : "任务状态刷新失败。",
      );
    } finally {
      setIsRefreshingTask(false);
    }
  }

  async function handleSubmitTask() {
    if (!videoApiLabel) {
      setTaskMessage("视频 API 暂不可用。");
      return;
    }

    if (!selectedModel || !selectedMode) {
      setTaskMessage("当前没有可用的视频模型能力。");
      return;
    }

    if (!draft.prompt.trim()) {
      setTaskMessage("请先填写视频 Prompt。");
      return;
    }

    for (const slot of selectedMode.assetSlots) {
      const files = assetFiles[slot.id] ?? [];
      if (!slot.optional && files.length < slot.minFiles) {
        setTaskMessage(`请先补充素材：${slot.label}`);
        return;
      }
      if (files.length > slot.maxFiles) {
        setTaskMessage(`${slot.label} 最多支持 ${slot.maxFiles} 个文件。`);
        return;
      }
    }

    setIsSubmittingTask(true);
    setTaskMessage("正在创建视频生成任务...");

    try {
      const body = new FormData();
      body.append(
        "request_json",
        JSON.stringify(buildTaskPayload(selectedModel, draft)),
      );

      Object.entries(assetFiles).forEach(([slotId, files]) => {
        files.forEach((file) => {
          body.append(slotId, file);
        });
      });

      const response = await fetch(videoApiUrl(videoApiRoutes.tasks), {
        method: "POST",
        body,
      });
      if (!response.ok) {
        throw new Error(await readVideoApiError(response));
      }

      const payload = await response.json();
      const task = normalizeVideoTaskPayload(payload);
      if (!task) {
        throw new Error("任务创建成功，但返回格式不正确。");
      }

      startTransition(() => {
        setLatestTask(task);
        setBackendStatus("online");
        setTaskMessage(`任务已创建：${task.statusLabel}`);
      });
    } catch (error) {
      setBackendStatus("offline");
      setTaskMessage(
        error instanceof Error ? error.message : "创建任务失败。",
      );
    } finally {
      setIsSubmittingTask(false);
    }
  }

  async function handleAnalyzeVideo() {
    if (!videoApiLabel) {
      setAnalysisMessage("视频 API 暂不可用。");
      return;
    }

    if (!videoFile) {
      setAnalysisMessage("请先选择要拆解的视频文件。");
      return;
    }

    setIsAnalyzing(true);
    setAnalysisMessage("正在上传视频并生成拆解结果...");

    try {
      const body = new FormData();
      body.append("file", videoFile);
      body.append("interval_seconds", String(analysisInterval));
      body.append("max_frames", String(analysisFrames));
      body.append(
        "runtime",
        JSON.stringify({
          task: "frameAnalysis",
          ...aiRuntimeSettings.frameAnalysis,
        })
      );
      body.append("runtimeConfig", JSON.stringify(aiRuntimeSettings));

      const response = await fetch(videoApiUrl(videoApiRoutes.upload), {
        method: "POST",
        body,
      });
      if (!response.ok) {
        throw new Error(await readVideoApiError(response));
      }

      const payload = (await response.json()) as { manifest?: Record<string, unknown> };
      const rawManifest = payload.manifest;
      const normalizedManifest = normalizeManifestPayload(payload);
      if (!normalizedManifest || !rawManifest) {
        throw new Error("视频拆解结果格式不正确。");
      }

      startTransition(() => {
        setManifestRaw(rawManifest);
        setManifest(normalizedManifest);
        setCopyPlan(null);
        setCopyForm((current) => ({
          ...current,
          transcript: normalizedManifest.transcriptText || current.transcript,
        }));
        setBackendStatus("online");
        setAnalysisMessage("视频拆解完成，可以继续生成新脚本。");
      });
    } catch (error) {
      setBackendStatus("offline");
      setAnalysisMessage(
        error instanceof Error ? error.message : "视频拆解失败。",
      );
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function handleGenerateCopy() {
    if (!videoApiLabel) {
      setCopyMessage("视频 API 暂不可用。");
      return;
    }

    if (!manifestRaw) {
      setCopyMessage("请先完成视频拆解。");
      return;
    }

    setIsGeneratingCopy(true);
    setCopyMessage("正在基于视频结构生成新的脚本方案...");

    try {
      const response = await fetch(videoApiUrl(videoApiRoutes.copy), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          form: copyForm,
          manifest: manifestRaw,
          runtime: {
            task: "copyGeneration",
            ...aiRuntimeSettings.copyGeneration,
          },
          runtimeConfig: aiRuntimeSettings,
        }),
      });
      if (!response.ok) {
        throw new Error(await readVideoApiError(response));
      }

      const payload = await response.json();
      const normalizedPlan = normalizeCopyPlanPayload(payload);
      if (!normalizedPlan) {
        throw new Error("脚本生成结果格式不正确。");
      }

      startTransition(() => {
        setCopyPlan(normalizedPlan);
        setBackendStatus("online");
        setCopyMessage("视频改写脚本已经生成，可以继续投喂视频模型。");
      });
    } catch (error) {
      setBackendStatus("offline");
      setCopyMessage(
        error instanceof Error ? error.message : "脚本生成失败。",
      );
    } finally {
      setIsGeneratingCopy(false);
    }
  }

  return (
    <section className="page-shell mt-8 space-y-6">
      <article className="obsidian-workbench p-6 sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <p className="section-kicker">视频 API 状态</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[#f3e8d2]">
              视频模块保留真实业务能力，但前端已经统一进门户。
            </h2>
            <p className="mt-3 text-sm leading-7 text-stone-300/80">
              当前页面默认对接项目内 Next.js API 路由，既能做本地视频拆解和脚本生成，也能保留后续视频模型任务编排入口。
            </p>
          </div>

          <div className="obsidian-soft-card min-w-[18rem] p-5">
            <div className="flex items-center justify-between gap-3">
              <span className="section-kicker">Runtime</span>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${statusTone(
                  backendStatus,
                )}`}
              >
                {backendStatus}
              </span>
            </div>
            <p className="mt-3 text-sm leading-7 text-stone-300/80">
              {backendMessage}
            </p>
            <p className="mt-3 text-xs leading-6 text-stone-400/80">
              {useLegacyVideoApi
                ? `Legacy API: ${videoApiLabel}`
                : "Default API: Next.js /api/video-studio"}
            </p>
          </div>
        </div>

        {useLegacyVideoApi ? (
          <div className="obsidian-inline-note mt-6 rounded-[1.5rem] border-dashed px-5 py-4 text-sm leading-7 text-stone-300/80">
            当前检测到 legacy 视频后端地址，页面会继续优先使用
            `NEXT_PUBLIC_VIDEO_API_BASE_URL`。移除该变量后，将默认走项目内
            Next.js API 路由。
          </div>
        ) : null}
      </article>

      <VideoRuntimeConfigPanel
        useLegacyApi={useLegacyVideoApi}
        onServerStatusChange={handleServerStatusChange}
      />

      <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <div className="space-y-6">
          <article className="obsidian-workbench p-6 sm:p-7">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="section-kicker">视频拆解</p>
                <h3 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[#f3e8d2]">
                  上传本地视频，拿到结构块、关键帧和原字幕。
                </h3>
              </div>
              <button
                type="button"
                onClick={() => void handleAnalyzeVideo()}
                disabled={isAnalyzing}
                className={`inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition ${
                  isAnalyzing
                    ? "obsidian-action-secondary cursor-not-allowed opacity-60"
                    : "obsidian-action"
                }`}
              >
                {isAnalyzing ? "分析中..." : "开始拆解"}
              </button>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_0.45fr_0.45fr]">
              <label className="obsidian-soft-card px-4 py-4">
                <span className="section-kicker">视频文件</span>
                <input
                  type="file"
                  accept="video/*"
                  onChange={(event) => setVideoFile(event.target.files?.[0] ?? null)}
                  className="obsidian-native-field mt-4 block w-full cursor-pointer text-sm text-stone-300/80 file:mr-4 file:rounded-full file:border-0 file:bg-[rgba(196,138,86,0.18)] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[#f3e8d2]"
                />
                <p className="mt-3 text-xs leading-6 text-stone-400/80">
                  {videoFile ? videoFile.name : "支持 mp4 / mov / webm 等常见格式"}
                </p>
              </label>

              <label className="obsidian-soft-card px-4 py-4">
                <span className="section-kicker">抽帧间隔</span>
                <input
                  type="number"
                  min={1}
                  max={600}
                  value={analysisInterval}
                  onChange={(event) => setAnalysisInterval(event.target.valueAsNumber || 110)}
                  className="obsidian-native-field mt-4"
                />
              </label>

              <label className="obsidian-soft-card px-4 py-4">
                <span className="section-kicker">最大帧数</span>
                <input
                  type="number"
                  min={1}
                  max={48}
                  value={analysisFrames}
                  onChange={(event) => setAnalysisFrames(event.target.valueAsNumber || 6)}
                  className="obsidian-native-field mt-4"
                />
              </label>
            </div>

            <p className="obsidian-inline-note mt-5 px-4 py-3 text-sm leading-7 text-stone-300/80">
              {analysisMessage}
            </p>

            {manifest ? (
              <div className="mt-6 space-y-6">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="obsidian-soft-card px-4 py-4">
                    <p className="section-kicker">视频时长</p>
                    <p className="mt-3 text-3xl font-semibold text-[#f3e8d2]">
                      {formatSeconds(manifest.durationSeconds)}
                    </p>
                  </div>
                  <div className="obsidian-soft-card px-4 py-4">
                    <p className="section-kicker">抽帧数量</p>
                    <p className="mt-3 text-3xl font-semibold text-[#f3e8d2]">
                      {manifest.frames.length}
                    </p>
                  </div>
                  <div className="obsidian-soft-card px-4 py-4">
                    <p className="section-kicker">结构块</p>
                    <p className="mt-3 text-3xl font-semibold text-[#f3e8d2]">
                      {manifest.structureBlocks.length}
                    </p>
                  </div>
                </div>

                {manifest.frames.length ? (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {manifest.frames.map((frame) => (
                      <article
                        key={`${frame.index}-${frame.timestampSeconds}`}
                        className="obsidian-soft-card overflow-hidden"
                      >
                        {frame.src ? (
                          <img
                            src={frame.src}
                            alt={`Frame ${frame.index + 1}`}
                            className="aspect-video w-full object-cover"
                          />
                        ) : (
                          <div className="obsidian-empty-state flex aspect-video items-center justify-center text-sm text-stone-400/80">
                            No preview
                          </div>
                        )}
                        <div className="px-4 py-4">
                          <p className="text-sm font-semibold text-[#f3e8d2]">
                            Frame {frame.index + 1}
                          </p>
                          <p className="mt-1 text-sm text-stone-400/80">
                            {formatSeconds(frame.timestampSeconds)}
                          </p>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : null}

                {manifest.structureBlocks.length ? (
                  <div className="grid gap-4">
                    {manifest.structureBlocks.map((block) => (
                      <article
                        key={block.id || `${block.stage}-${block.startSeconds}`}
                        className="obsidian-soft-card px-5 py-5"
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${stageTone(
                                  block.stage,
                                )}`}
                              >
                                {block.stageLabel || block.stage}
                              </span>
                              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400/80">
                                {formatSeconds(block.startSeconds)} - {formatSeconds(block.endSeconds)}
                              </span>
                            </div>
                            <h4 className="mt-3 text-lg font-semibold text-[#f3e8d2]">
                              {block.title}
                            </h4>
                          </div>

                          <span className="obsidian-meta-pill normal-case tracking-[0.12em]">
                            {formatConfidence(block.confidence)}
                          </span>
                        </div>
                        <p className="mt-3 text-sm leading-7 text-stone-300/80">
                          {block.summary}
                        </p>
                      </article>
                    ))}
                  </div>
                ) : null}

                <label className="obsidian-soft-card px-5 py-5">
                  <span className="section-kicker">字幕 / 原文</span>
                  <textarea
                    rows={12}
                    value={copyForm.transcript}
                    onChange={(event) => updateCopyForm("transcript", event.target.value)}
                    className="obsidian-native-textarea mt-4"
                  />
                </label>
              </div>
            ) : null}
          </article>

          <article className="obsidian-workbench p-6 sm:p-7">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="section-kicker">脚本改写</p>
                <h3 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[#f3e8d2]">
                  基于拆解结果生成新脚本、角度和视频 Prompt。
                </h3>
              </div>
              <button
                type="button"
                onClick={() => void handleGenerateCopy()}
                disabled={isGeneratingCopy || !manifestRaw}
                className={`inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition ${
                  isGeneratingCopy || !manifestRaw
                    ? "obsidian-action-secondary cursor-not-allowed opacity-60"
                    : "obsidian-action"
                }`}
              >
                {isGeneratingCopy ? "生成中..." : "生成改写方案"}
              </button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="obsidian-soft-card px-4 py-4">
                <span className="section-kicker">产品名称</span>
                <input
                  value={copyForm.productName}
                  onChange={(event) => updateCopyForm("productName", event.target.value)}
                  className="obsidian-native-field mt-4"
                />
              </label>
              <label className="obsidian-soft-card px-4 py-4">
                <span className="section-kicker">品类</span>
                <input
                  value={copyForm.category}
                  onChange={(event) => updateCopyForm("category", event.target.value)}
                  className="obsidian-native-field mt-4"
                />
              </label>
              <label className="obsidian-soft-card px-4 py-4 md:col-span-2">
                <span className="section-kicker">核心卖点</span>
                <textarea
                  rows={4}
                  value={copyForm.sellingPoints}
                  onChange={(event) => updateCopyForm("sellingPoints", event.target.value)}
                  className="obsidian-native-textarea mt-4"
                />
              </label>
            </div>

            <p className="obsidian-inline-note mt-5 px-4 py-3 text-sm leading-7 text-stone-300/80">
              {copyMessage}
            </p>

            {copyPlan ? (
              <div className="mt-6 space-y-6">
                <div className="obsidian-soft-card px-5 py-5">
                  <p className="section-kicker">策略总结</p>
                  <p className="mt-3 text-sm leading-7 text-stone-300/80">
                    {copyPlan.summary}
                  </p>
                  <div className="obsidian-code-panel mt-5 rounded-[1.3rem] px-4 py-4 text-sm leading-7 text-stone-100/90">
                    <pre className="whitespace-pre-wrap">{copyPlan.prompt}</pre>
                  </div>
                </div>

                {copyPlan.scriptDrafts.map((draftItem) => (
                  <article
                    key={draftItem.id}
                    className="obsidian-soft-card px-5 py-5"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="section-kicker">{draftItem.caption || "Script draft"}</p>
                        <h4 className="mt-2 text-xl font-semibold text-[#f3e8d2]">
                          {draftItem.headline}
                        </h4>
                        <p className="mt-2 text-sm leading-7 text-stone-300/80">
                          {draftItem.summary}
                        </p>
                      </div>
                      <span className="obsidian-meta-pill px-3 py-1 text-xs font-semibold text-stone-200/80">
                        {draftItem.angleName}
                      </span>
                    </div>

                    <pre className="obsidian-code-panel mt-5 overflow-x-auto whitespace-pre-wrap rounded-[1.3rem] px-4 py-4 text-sm leading-7 text-stone-100/90">
                      {draftItem.fullScript}
                    </pre>
                  </article>
                ))}
              </div>
            ) : null}

            <div className="obsidian-inline-note mt-6 rounded-[1.5rem] border-dashed px-4 py-4 text-sm leading-7 text-stone-300/80">
              {deferredTranscript
                ? `当前字幕预览：${deferredTranscript.slice(0, 180)}${deferredTranscript.length > 180 ? "..." : ""}`
                : "拆解后字幕会自动同步到脚本改写区。"}
            </div>
          </article>
        </div>

        <div className="space-y-6">
          <article className="obsidian-workbench p-6 sm:p-7">
            <p className="section-kicker">模型选择</p>
            <h3 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[#f3e8d2]">
              当前视频生成任务支持的模型能力。
            </h3>

            <div className="mt-6 grid gap-4">
              {models.map((model) => (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => handleSelectModel(model.id)}
                  className={`rounded-[1.5rem] border px-5 py-5 text-left transition ${
                    selectedModel?.id === model.id
                      ? "obsidian-card border-[rgba(196,138,86,0.35)] text-white"
                      : "obsidian-soft-card hover:border-[rgba(196,138,86,0.28)]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className={`section-kicker ${selectedModel?.id === model.id ? "text-white/45" : ""}`}>
                        {model.provider}
                      </p>
                      <h4 className="mt-2 text-lg font-semibold">{model.name}</h4>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        selectedModel?.id === model.id
                          ? "obsidian-meta-pill bg-white/10 text-white"
                          : "obsidian-meta-pill text-stone-200/80"
                      }`}
                    >
                      {model.statusLabel}
                    </span>
                  </div>
                  <p className={`mt-3 text-sm leading-7 ${selectedModel?.id === model.id ? "text-white/70" : "text-stone-300/80"}`}>
                    {model.description}
                  </p>
                </button>
              ))}
            </div>
          </article>

          <article className="obsidian-workbench p-6 sm:p-7">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="section-kicker">任务配置</p>
                <h3 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[#f3e8d2]">
                  用统一前端直接创建视频生成任务。
                </h3>
              </div>
              <button
                type="button"
                onClick={() => void handleSubmitTask()}
                disabled={isSubmittingTask || !selectedModel}
                className={`inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition ${
                  isSubmittingTask || !selectedModel
                    ? "obsidian-action-secondary cursor-not-allowed opacity-60"
                    : "obsidian-action"
                }`}
              >
                {isSubmittingTask ? "创建中..." : "创建任务"}
              </button>
            </div>

            {selectedModel ? (
              <div className="mt-6 space-y-5">
                <div className="grid gap-2">
                  {selectedModel.supportedInputModes.map((mode) => (
                    <button
                      key={mode.mode}
                      type="button"
                      onClick={() => updateDraft("inputMode", mode.mode)}
                      className={`flex items-center justify-between rounded-[1.3rem] border px-4 py-3 text-left transition ${
                        draft.inputMode === mode.mode
                          ? "obsidian-card border-[rgba(196,138,86,0.35)] text-white"
                          : "obsidian-soft-card text-stone-300/80"
                      }`}
                    >
                      <div>
                        <p className="text-sm font-semibold">{mode.label}</p>
                        <p className={`mt-1 text-sm ${draft.inputMode === mode.mode ? "text-white/70" : "text-stone-400/80"}`}>
                          {mode.description}
                        </p>
                      </div>
                      <span className="text-xs font-semibold uppercase tracking-[0.18em]">
                        {modeLabels[mode.mode]}
                      </span>
                    </button>
                  ))}
                </div>

                <label className="block">
                  <span className="section-kicker">Prompt</span>
                  <textarea
                    rows={6}
                    value={draft.prompt}
                    onChange={(event) => updateDraft("prompt", event.target.value)}
                    className="obsidian-native-textarea mt-3"
                  />
                </label>

                {selectedMode?.assetSlots.length ? (
                  <div className="grid gap-4">
                    {selectedMode.assetSlots.map((slot) => (
                      <label
                        key={slot.id}
                        className="obsidian-soft-card px-4 py-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="section-kicker">{slot.label}</p>
                            <p className="mt-2 text-sm leading-7 text-stone-300/80">
                              {slot.description}
                            </p>
                          </div>
                          <span className="obsidian-meta-pill normal-case tracking-[0.12em]">
                            {slot.optional ? "可选" : "必填"}
                          </span>
                        </div>
                        <input
                          type="file"
                          accept={slot.accept}
                          multiple={slot.multiple}
                          onChange={(event) => updateSlotFiles(slot.id, event.target.files)}
                          className="obsidian-native-field mt-4 block w-full cursor-pointer text-sm text-stone-300/80 file:mr-4 file:rounded-full file:border-0 file:bg-[rgba(196,138,86,0.18)] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[#f3e8d2]"
                        />
                      </label>
                    ))}
                  </div>
                ) : null}

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="obsidian-soft-card px-4 py-4">
                    <span className="section-kicker">画幅比例</span>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedModel.supportedAspectRatios.map((ratio) => (
                        <button
                          key={ratio}
                          type="button"
                          onClick={() => updateDraft("aspectRatio", ratio)}
                          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                            draft.aspectRatio === ratio
                              ? "obsidian-action text-[#f7f0e6]"
                              : "obsidian-meta-pill bg-[rgba(255,255,255,0.04)] text-[#c5b9aa]"
                          }`}
                        >
                          {ratio}
                        </button>
                      ))}
                    </div>
                  </label>

                  <label className="obsidian-soft-card px-4 py-4">
                    <span className="section-kicker">时长</span>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {durationOptions.map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => updateDraft("durationSeconds", option)}
                          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                            draft.durationSeconds === option
                              ? "obsidian-action text-[#f7f0e6]"
                              : "obsidian-meta-pill bg-[rgba(255,255,255,0.04)] text-[#c5b9aa]"
                          }`}
                        >
                          {option}s
                        </button>
                      ))}
                    </div>
                  </label>
                </div>

                {selectedModel.supportedParameters.map((parameter) => {
                  if (numericParameterKeys.includes(parameter.key)) {
                    const draftKey =
                      parameter.key === "motion_strength"
                        ? "motionStrength"
                        : parameter.key === "camera_strength"
                          ? "cameraStrength"
                          : parameter.key === "style_strength"
                            ? "styleStrength"
                            : null;

                    if (!draftKey) {
                      return null;
                    }

                    const currentValue =
                      draft[draftKey] ??
                      (typeof parameter.defaultValue === "number"
                        ? parameter.defaultValue
                        : parameter.min ?? 0);

                    return (
                      <label
                        key={parameter.key}
                        className="obsidian-soft-card px-4 py-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="section-kicker">{parameter.label}</span>
                          <span className="obsidian-meta-pill normal-case tracking-[0.12em]">
                            {currentValue}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={parameter.min}
                          max={parameter.max}
                          step={parameter.step ?? 1}
                          value={typeof currentValue === "number" ? currentValue : 0}
                          onChange={(event) =>
                            updateDraft(
                              draftKey,
                              Number(event.target.value) as VideoGenerationDraft[typeof draftKey],
                            )
                          }
                          className="mt-4 w-full accent-[#c48a56]"
                        />
                      </label>
                    );
                  }

                  return null;
                })}

                <p className="obsidian-inline-note rounded-[1.4rem] px-4 py-3 text-sm leading-7 text-stone-300/80">
                  {taskMessage}
                </p>
              </div>
            ) : null}
          </article>

          <article className="obsidian-workbench p-6 sm:p-7">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="section-kicker">任务状态</p>
                <h3 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[#f3e8d2]">
                  创建后在这里查看参数快照与结果占位。
                </h3>
              </div>
              {latestTask ? (
                <button
                  type="button"
                  onClick={() => void handleRefreshTask(latestTask.taskId)}
                  disabled={isRefreshingTask}
                  className={`inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition ${
                    isRefreshingTask
                      ? "obsidian-action-secondary cursor-not-allowed opacity-60"
                      : "obsidian-action-secondary"
                  }`}
                >
                  {isRefreshingTask ? "刷新中..." : "刷新状态"}
                </button>
              ) : null}
            </div>

            {latestTask ? (
              <div className="mt-6 space-y-5">
                <div className="obsidian-soft-card px-5 py-5">
                  <p className="section-kicker">{latestTask.provider}</p>
                  <h4 className="mt-2 text-xl font-semibold text-[#f3e8d2]">
                    {latestTask.modelName}
                  </h4>
                  <p className="mt-2 text-sm leading-7 text-stone-300/80">
                    {latestTask.statusDetail}
                  </p>
                  <div className="mt-5 grid gap-3 text-sm text-stone-300/80">
                    <p>任务 ID：{latestTask.taskId}</p>
                    <p>输入模式：{modeLabels[latestTask.inputMode]}</p>
                    <p>创建时间：{formatDateTime(latestTask.createdAt)}</p>
                  </div>
                </div>

                <div className="obsidian-empty-state px-5 py-5">
                  <p className="section-kicker">结果占位</p>
                  <p className="mt-3 text-sm leading-7 text-stone-300/80">
                    {latestTask.result.placeholderMessage || "等待真实视频结果。"}
                  </p>
                </div>
              </div>
            ) : (
              <div className="obsidian-empty-state mt-6 px-5 py-6 text-sm leading-7">
                当前还没有视频生成任务。选择模型并创建一次任务后，这里会展示状态、素材和参数快照。
              </div>
            )}
          </article>
        </div>
      </div>
    </section>
  );
}
