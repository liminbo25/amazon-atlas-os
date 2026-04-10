import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

import {
  RouteError,
  getRetryPromptSuffix,
  isRecord,
  logRouteError,
  normalizeNumberValue,
  normalizeStringValue,
  normalizeTextList,
  requestAiTextCompletion,
  requestAiVisionCompletion,
  requestStructuredJson,
  resolveAiConfig,
  type AiImageInput,
  type AiRuntimeConfig,
} from "./ai-route-helpers";
import type { CopyPlan, VideoInputMode } from "./video-studio";

const execFileAsync = promisify(execFile);

const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp";
const SUPPORTED_INPUT_MODES = new Set<VideoInputMode>([
  "text_to_video",
  "image_to_video",
  "frame_to_video",
  "multi_image_to_video",
]);
const DEFAULT_VIDEO_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_TRANSCRIBE_MODEL = "whisper-1";
const DEFAULT_VIDEO_MAX_UPLOAD_MB = 80;
const OUTPUT_API_PREFIX = "/api/video-studio/output/";
const FFMPEG_TIMEOUT_MS = 45_000;
const TRANSCRIBE_TIMEOUT_MS = 120_000;

type VideoStage = "stop" | "pain" | "solution" | "trust" | "buy";

interface VideoModelAssetSlotWire {
  id: string;
  label: string;
  description: string;
  accept: string;
  multiple: boolean;
  optional: boolean;
  min_files: number;
  max_files: number;
}

interface VideoModelInputModeWire {
  mode: VideoInputMode;
  label: string;
  description: string;
  asset_slots: VideoModelAssetSlotWire[];
}

interface VideoModelParameterWire {
  key:
    | "negative_prompt"
    | "seed"
    | "motion_strength"
    | "camera_strength"
    | "style_strength";
  label: string;
  description: string;
  kind: "textarea" | "number" | "range";
  min?: number;
  max?: number;
  step?: number;
  default_value?: number | string;
}

interface VideoModelCapabilityWire {
  id: string;
  name: string;
  provider: string;
  description: string;
  integration_status: "planned" | "connected";
  status_label: string;
  status_detail: string;
  supported_input_modes: VideoModelInputModeWire[];
  supported_aspect_ratios: string[];
  duration: {
    min_seconds: number;
    max_seconds: number;
    step_seconds: number;
    default_seconds: number;
  };
  qualities: Array<{
    id: string;
    label: string;
    description: string;
  }>;
  supported_parameters: VideoModelParameterWire[];
  notes: string[];
}

interface NormalizedVideoTaskPayload {
  model_id: string;
  input_mode: VideoInputMode;
  prompt: string;
  negative_prompt?: string;
  parameters: Record<string, number | string>;
}

interface SavedVideoAsset {
  slot_id: string;
  label: string;
  kind: "image";
  name: string;
  size_bytes: number;
  relative_path: string;
  url?: string;
}

interface VideoGenerationTaskWire {
  task_id: string;
  model_id: string;
  model_name: string;
  provider: string;
  integration_status: "planned" | "connected";
  input_mode: VideoInputMode;
  status: string;
  status_label: string;
  status_detail: string;
  created_at: string;
  updated_at: string;
  prompt: string;
  negative_prompt?: string;
  parameters: Record<string, unknown>;
  assets: SavedVideoAsset[];
  provider_request_preview: Record<string, unknown>;
  result: {
    videos: Array<{
      label: string;
      relative_path?: string;
      url?: string;
      note?: string;
    }>;
    placeholder_message: string;
    next_step: string;
  };
}

interface VideoProbeResult {
  durationSeconds: number;
  frameCount: number;
  fps: number;
  width: number;
  height: number;
}

interface TranscriptSegment {
  id: string;
  start_seconds: number;
  end_seconds: number;
  text: string;
}

interface ManifestFrame {
  index: number;
  timestamp_seconds: number;
  file: string;
  relative_path?: string;
  src?: string;
  note?: string;
}

interface VisualFrameObservation {
  frame_index: number;
  timestamp_seconds: number;
  description: string;
  marketing_role: string;
  shot_type: string;
  selling_signal: string;
  note: string;
}

interface VideoVisualAnalysis {
  summary: string;
  visual_style: string;
  hook_strategy: string;
  product_presence: string;
  proof_signals: string;
  cta_observation: string;
  frame_observations: VisualFrameObservation[];
}

interface VideoManifestWire {
  job_id: string;
  video: string;
  original_filename: string;
  duration_seconds: number;
  frame_count: number;
  fps: number;
  width: number;
  height: number;
  frames: ManifestFrame[];
  transcript_text: string;
  transcript_segments: TranscriptSegment[];
  detected_language: string;
  visual_analysis?: VideoVisualAnalysis;
  structure_blocks: Array<{
    id: string;
    stage: VideoStage;
    stage_label: string;
    title: string;
    summary: string;
    summary_hint: string;
    recommendation: string;
    transcript: string;
    start_seconds: number;
    end_seconds: number;
    confidence: number;
    tags: string[];
    segment_ids: string[];
  }>;
  analysis_notes: string[];
}

interface AnalyzeVideoUploadOptions {
  request: Request;
  formData: FormData;
  runtimeConfig?: AiRuntimeConfig;
}

interface GenerateVideoCopyOptions {
  form: Record<string, unknown>;
  manifest: Record<string, unknown>;
  runtimeConfig?: AiRuntimeConfig;
}

const VIDEO_MODEL_CAPABILITIES: VideoModelCapabilityWire[] = [
  {
    id: "runway-gen4-turbo",
    name: "Runway Gen-4 Turbo",
    provider: "Runway",
    description: "适合快速验证广告短片脚本、镜头运动和商品展示节奏。",
    integration_status: "planned",
    status_label: "结构预留",
    status_detail:
      "已完成统一任务建档、素材入库和状态查询；真实 Runway 提交层待接入。",
    supported_input_modes: [
      {
        mode: "text_to_video",
        label: "文生视频",
        description: "只用提示词生成整段视频。",
        asset_slots: [],
      },
      {
        mode: "image_to_video",
        label: "单图生视频",
        description: "上传一张主图驱动画面主体和镜头运动。",
        asset_slots: [
          {
            id: "source_image",
            label: "主图",
            description: "用于生成视频主体的单张商品或场景图片。",
            accept: IMAGE_ACCEPT,
            multiple: false,
            optional: false,
            min_files: 1,
            max_files: 1,
          },
        ],
      },
      {
        mode: "frame_to_video",
        label: "首尾帧视频",
        description: "上传首帧和尾帧控制起止画面。",
        asset_slots: [
          {
            id: "first_frame",
            label: "首帧",
            description: "视频的起始画面。",
            accept: IMAGE_ACCEPT,
            multiple: false,
            optional: false,
            min_files: 1,
            max_files: 1,
          },
          {
            id: "last_frame",
            label: "尾帧",
            description: "视频的结束画面。",
            accept: IMAGE_ACCEPT,
            multiple: false,
            optional: false,
            min_files: 1,
            max_files: 1,
          },
        ],
      },
    ],
    supported_aspect_ratios: ["16:9", "9:16", "1:1"],
    duration: {
      min_seconds: 5,
      max_seconds: 10,
      step_seconds: 5,
      default_seconds: 5,
    },
    qualities: [
      { id: "720p", label: "720p", description: "适合快速验证。" },
      { id: "1080p", label: "1080p", description: "适合正式成片。" },
    ],
    supported_parameters: [
      {
        key: "seed",
        label: "Seed",
        description: "控制结果复现。",
        kind: "number",
        min: 0,
        max: 2147483647,
        step: 1,
      },
      {
        key: "motion_strength",
        label: "运动强度",
        description: "控制主体动作幅度。",
        kind: "range",
        min: 1,
        max: 10,
        step: 1,
        default_value: 5,
      },
      {
        key: "camera_strength",
        label: "镜头强度",
        description: "控制推拉摇移的存在感。",
        kind: "range",
        min: 1,
        max: 10,
        step: 1,
        default_value: 4,
      },
    ],
    notes: [
      "当前返回任务占位结果，不伪装成真实供应商产出。",
      "接入真实 Provider 后，可复用同一任务结构回写视频 URL。",
    ],
  },
  {
    id: "kling-2-master",
    name: "Kling 2 Master",
    provider: "Kling",
    description: "适合广告感更强的商品视频，支持多图参考和更完整的高级参数。",
    integration_status: "planned",
    status_label: "结构预留",
    status_detail:
      "已具备 Kling 能力配置、任务参数组织和文件归档；真实接口待接入。",
    supported_input_modes: [
      {
        mode: "text_to_video",
        label: "文生视频",
        description: "直接从文案生成视频。",
        asset_slots: [],
      },
      {
        mode: "image_to_video",
        label: "单图生视频",
        description: "用一张主图驱动画面和动作。",
        asset_slots: [
          {
            id: "source_image",
            label: "主图",
            description: "作为主体参考的关键图片。",
            accept: IMAGE_ACCEPT,
            multiple: false,
            optional: false,
            min_files: 1,
            max_files: 1,
          },
          {
            id: "reference_images",
            label: "参考图",
            description: "可补充风格、商品角度或场景气质。",
            accept: IMAGE_ACCEPT,
            multiple: true,
            optional: true,
            min_files: 0,
            max_files: 4,
          },
        ],
      },
      {
        mode: "frame_to_video",
        label: "首尾帧视频",
        description: "上传首尾帧控制转场和结果落点。",
        asset_slots: [
          {
            id: "first_frame",
            label: "首帧",
            description: "视频开头画面。",
            accept: IMAGE_ACCEPT,
            multiple: false,
            optional: false,
            min_files: 1,
            max_files: 1,
          },
          {
            id: "last_frame",
            label: "尾帧",
            description: "视频结束画面。",
            accept: IMAGE_ACCEPT,
            multiple: false,
            optional: false,
            min_files: 1,
            max_files: 1,
          },
          {
            id: "reference_images",
            label: "参考图",
            description: "补充商品细节或风格锚点。",
            accept: IMAGE_ACCEPT,
            multiple: true,
            optional: true,
            min_files: 0,
            max_files: 4,
          },
        ],
      },
      {
        mode: "multi_image_to_video",
        label: "多图参考视频",
        description: "使用多张参考图统一主体和风格。",
        asset_slots: [
          {
            id: "reference_images",
            label: "参考图组",
            description: "至少上传两张图，用于统一商品和风格。",
            accept: IMAGE_ACCEPT,
            multiple: true,
            optional: false,
            min_files: 2,
            max_files: 6,
          },
        ],
      },
    ],
    supported_aspect_ratios: ["16:9", "9:16", "1:1", "4:5"],
    duration: {
      min_seconds: 5,
      max_seconds: 15,
      step_seconds: 5,
      default_seconds: 10,
    },
    qualities: [
      { id: "720p", label: "720p", description: "快速测试和迭代。" },
      { id: "1080p", label: "1080p", description: "正式成片质量。" },
    ],
    supported_parameters: [
      {
        key: "negative_prompt",
        label: "负向 Prompt",
        description: "指定不希望出现的动作、材质或镜头问题。",
        kind: "textarea",
      },
      {
        key: "seed",
        label: "Seed",
        description: "控制复现。",
        kind: "number",
        min: 0,
        max: 2147483647,
        step: 1,
      },
      {
        key: "motion_strength",
        label: "运动强度",
        description: "控制动作幅度。",
        kind: "range",
        min: 1,
        max: 10,
        step: 1,
        default_value: 6,
      },
      {
        key: "camera_strength",
        label: "镜头强度",
        description: "控制镜头运动感。",
        kind: "range",
        min: 1,
        max: 10,
        step: 1,
        default_value: 5,
      },
      {
        key: "style_strength",
        label: "风格强度",
        description: "控制风格化程度。",
        kind: "range",
        min: 1,
        max: 10,
        step: 1,
        default_value: 6,
      },
    ],
    notes: [
      "支持的输入方式最完整，适合做差异化表单演示。",
      "参考图和多图输入已完成任务层建模，真实生成仍需供应商 API 接入。",
    ],
  },
  {
    id: "pixverse-v4",
    name: "PixVerse V4",
    provider: "PixVerse",
    description: "适合节奏感更强、风格化更明显的短视频生成。",
    integration_status: "planned",
    status_label: "结构预留",
    status_detail: "已完成 PixVerse 能力抽象与任务接口，真实调用层未接入。",
    supported_input_modes: [
      {
        mode: "text_to_video",
        label: "文生视频",
        description: "用文字直接生成短视频。",
        asset_slots: [],
      },
      {
        mode: "image_to_video",
        label: "单图生视频",
        description: "上传主图生成视频。",
        asset_slots: [
          {
            id: "source_image",
            label: "主图",
            description: "商品或人物主图。",
            accept: IMAGE_ACCEPT,
            multiple: false,
            optional: false,
            min_files: 1,
            max_files: 1,
          },
        ],
      },
    ],
    supported_aspect_ratios: ["16:9", "9:16"],
    duration: {
      min_seconds: 5,
      max_seconds: 8,
      step_seconds: 1,
      default_seconds: 5,
    },
    qualities: [
      { id: "720p", label: "720p", description: "标准输出。" },
      { id: "1080p", label: "1080p", description: "高清输出。" },
    ],
    supported_parameters: [
      {
        key: "negative_prompt",
        label: "负向 Prompt",
        description: "排除不想出现的元素。",
        kind: "textarea",
      },
      {
        key: "style_strength",
        label: "风格强度",
        description: "控制风格化表现。",
        kind: "range",
        min: 1,
        max: 10,
        step: 1,
        default_value: 7,
      },
    ],
    notes: [
      "更适合强调节奏、滤镜和包装感的素材。",
      "当前结果区只返回任务占位，不返回真实视频文件。",
    ],
  },
  {
    id: "veo-creative",
    name: "Veo Creative",
    provider: "Veo",
    description: "适合从脚本 Prompt 快速起片，也支持图生视频补充。",
    integration_status: "planned",
    status_label: "结构预留",
    status_detail: "任务入口、参数校验和状态查询已完成，真实 Veo 提交链路待接入。",
    supported_input_modes: [
      {
        mode: "text_to_video",
        label: "文生视频",
        description: "直接根据 Prompt 出片。",
        asset_slots: [],
      },
      {
        mode: "image_to_video",
        label: "单图生视频",
        description: "上传一张商品或场景图作为画面锚点。",
        asset_slots: [
          {
            id: "source_image",
            label: "主图",
            description: "作为画面锚点的单张图片。",
            accept: IMAGE_ACCEPT,
            multiple: false,
            optional: false,
            min_files: 1,
            max_files: 1,
          },
        ],
      },
    ],
    supported_aspect_ratios: ["16:9", "9:16", "1:1"],
    duration: {
      min_seconds: 5,
      max_seconds: 10,
      step_seconds: 5,
      default_seconds: 5,
    },
    qualities: [
      { id: "720p", label: "720p", description: "结构验证。" },
      { id: "1080p", label: "1080p", description: "高清输出。" },
    ],
    supported_parameters: [
      {
        key: "seed",
        label: "Seed",
        description: "控制生成随机性。",
        kind: "number",
        min: 0,
        max: 2147483647,
        step: 1,
      },
      {
        key: "motion_strength",
        label: "运动强度",
        description: "控制主体动作感。",
        kind: "range",
        min: 1,
        max: 10,
        step: 1,
        default_value: 5,
      },
    ],
    notes: [
      "适合承接现有脚本 Prompt，快速做文生视频首版。",
      "当前仅保留调用层结构，不伪装成已完成真实供应商接入。",
    ],
  },
];

const STAGE_META: Record<
  VideoStage,
  {
    label: string;
    title: string;
    summary: string;
    recommendation: string;
    tags: string[];
  }
> = {
  stop: {
    label: "停",
    title: "截停注意",
    summary: "用强反差、风险提醒或结果画面把观众停下来。",
    recommendation: "开场优先放强画面或强情绪，不要先铺背景。",
    tags: ["3秒钩子", "打断刷屏", "高停留"],
  },
  pain: {
    label: "痛",
    title: "放大问题",
    summary: "把用户眼前的麻烦讲到具体场景里。",
    recommendation: "优先拍问题正在发生的瞬间，而不是抽象解释。",
    tags: ["真实场景", "痛点显性化", "代入感"],
  },
  solution: {
    label: "药",
    title: "给出方案",
    summary: "让产品像顺理成章的解决方案一样出现。",
    recommendation: "先承接问题，再展示产品动作和关键卖点。",
    tags: ["产品入场", "卖点承接", "解决方案"],
  },
  trust: {
    label: "信",
    title: "建立信任",
    summary: "用对比、细节、结果或证明降低犹豫。",
    recommendation: "把结果和证据拍出来，不要只说有效。",
    tags: ["证据", "对比", "结果展示"],
  },
  buy: {
    label: "买",
    title: "驱动行动",
    summary: "给出明确动作和立刻行动的理由。",
    recommendation: "结尾要明确下一步，不要只停在介绍产品。",
    tags: ["CTA", "行动理由", "转化收口"],
  },
};

export function listVideoModels(): VideoModelCapabilityWire[] {
  return structuredClone(VIDEO_MODEL_CAPABILITIES);
}

export async function createVideoGenerationTask(
  request: Request,
  formData: FormData
): Promise<{ task: VideoGenerationTaskWire }> {
  const requestJson = formData.get("request_json");

  if (typeof requestJson !== "string") {
    throw new RouteError("Missing video generation task payload.", {
      status: 400,
      code: "video_task_payload_missing",
    });
  }

  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(requestJson);
  } catch (error) {
    throw new RouteError(
      `Video generation task payload must be valid JSON${
        error instanceof Error ? `: ${error.message}` : "."
      }`,
      {
        status: 400,
        code: "video_task_payload_invalid",
      }
    );
  }

  if (!isRecord(rawPayload)) {
    throw new RouteError("Video generation task payload must be an object.", {
      status: 400,
      code: "video_task_payload_invalid",
    });
  }

  const uploads = collectUploadFiles(formData, "request_json");
  const task = await createVideoTaskFromPayload(rawPayload, uploads);

  return { task: withVideoTaskUrls(task, request) };
}

export async function readVideoGenerationTask(
  request: Request,
  taskId: string
): Promise<{ task: VideoGenerationTaskWire }> {
  const normalizedTaskId = normalizeTaskId(taskId);
  const taskPath = path.join(
    /*turbopackIgnore: true*/ getVideoOutputRoot(),
    "video-generation",
    "tasks",
    normalizedTaskId,
    "task.json"
  );

  try {
    const task = JSON.parse(
      await fs.readFile(/*turbopackIgnore: true*/ taskPath, "utf8")
    ) as VideoGenerationTaskWire;
    return { task: withVideoTaskUrls(task, request) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new RouteError("Video generation task was not found.", {
        status: 404,
        code: "video_task_not_found",
      });
    }

    throw error;
  }
}

export async function analyzeVideoUpload({
  request,
  formData,
  runtimeConfig,
}: AnalyzeVideoUploadOptions): Promise<{ manifest: VideoManifestWire }> {
  const file = readRequiredFile(formData, "file");
  validateVideoUpload(file);

  const intervalSeconds = normalizeNumberValue(formData.get("interval_seconds"), {
    min: 1,
    max: 600,
    fallback: 110,
  });
  const maxFrames = normalizeNumberValue(formData.get("max_frames"), {
    min: 1,
    max: 48,
    integer: true,
    fallback: 6,
  });

  const outputRoot = getVideoOutputRoot();
  const uploadDir = path.join(/*turbopackIgnore: true*/ outputRoot, "_uploads");
  await fs.mkdir(uploadDir, { recursive: true });

  const originalName = file.name || "upload.mp4";
  const uploadPath = path.join(
    /*turbopackIgnore: true*/ uploadDir,
    `upload-${createTimestamp()}-${safeFileName(originalName, "video.mp4")}`
  );
  await writeFileUpload(file, uploadPath);

  const analysisNotes: string[] = [
    "已通过 Next.js API 路由接收并保存视频上传。",
  ];

  const probe = await probeVideo(uploadPath).catch((error: unknown) => {
    analysisNotes.push(formatOptionalFailure("视频元数据读取失败", error));
    return {
      durationSeconds: 0,
      frameCount: 0,
      fps: 0,
      width: 0,
      height: 0,
    } satisfies VideoProbeResult;
  });

  const jobId = `${safeSlug(path.parse(originalName).name)}-${createTimestamp()}`;
  const jobDir = path.join(/*turbopackIgnore: true*/ outputRoot, jobId);
  await fs.mkdir(jobDir, { recursive: true });

  const frames = await extractFrames({
    inputPath: uploadPath,
    jobDir,
    jobId,
    durationSeconds: probe.durationSeconds,
    intervalSeconds,
    maxFrames,
  }).catch((error: unknown) => {
    analysisNotes.push(formatOptionalFailure("关键帧抽取失败", error));
    return [] satisfies ManifestFrame[];
  });

  if (frames.length > 0) {
    analysisNotes.push(`已抽取 ${frames.length} 张关键帧。`);
  } else {
    analysisNotes.push("未抽取到关键帧，后续会基于元数据和手动字幕继续生成结构。");
  }

  const transcriptResult = await transcribeVideo(uploadPath, originalName).catch(
    (error: unknown) => ({
      text: "",
      segments: [] as TranscriptSegment[],
      language: "unknown",
      note: formatOptionalFailure("视频转写未完成", error),
    })
  );
  analysisNotes.push(transcriptResult.note);

  const visualAnalysis = await analyzeFramesWithAi({
    frames,
    jobId,
    runtimeConfig,
    transcriptText: transcriptResult.text,
    durationSeconds: probe.durationSeconds,
  }).catch((error: unknown) => {
    analysisNotes.push(formatOptionalFailure("关键帧视觉分析未完成", error));
    return null;
  });

  if (visualAnalysis) {
    analysisNotes.push("已使用统一 AI 配置完成关键帧视觉分析。");
  }

  const manifest: VideoManifestWire = {
    job_id: jobId,
    video: uploadPath,
    original_filename: originalName,
    duration_seconds: probe.durationSeconds,
    frame_count: probe.frameCount,
    fps: probe.fps,
    width: probe.width,
    height: probe.height,
    frames: applyVisualNotesToFrames(frames, visualAnalysis),
    transcript_text: transcriptResult.text,
    transcript_segments: transcriptResult.segments,
    detected_language: transcriptResult.language,
    visual_analysis: visualAnalysis ?? undefined,
    structure_blocks: buildStructureBlocks({
      transcriptSegments: transcriptResult.segments,
      visualAnalysis,
      frames,
      durationSeconds: probe.durationSeconds,
    }),
    analysis_notes: analysisNotes,
  };

  await fs.writeFile(
    path.join(/*turbopackIgnore: true*/ jobDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8"
  );

  return { manifest: withFrameUrls(manifest, request) };
}

export async function generateVideoCopyPlan({
  form,
  manifest,
  runtimeConfig,
}: GenerateVideoCopyOptions): Promise<{ copy_plan: CopyPlan }> {
  const transcriptText =
    normalizeStringValue(manifest.transcript_text, { allowEmpty: true }) ||
    normalizeStringValue(form.transcript, { allowEmpty: true });
  const structureBlocks = Array.isArray(manifest.structure_blocks)
    ? manifest.structure_blocks
    : [];
  const visualAnalysis = isRecord(manifest.visual_analysis)
    ? manifest.visual_analysis
    : {};

  if (
    !transcriptText &&
    structureBlocks.length === 0 &&
    Object.keys(visualAnalysis).length === 0
  ) {
    throw new RouteError(
      "Analyze a video or provide transcript/context before generating video copy.",
      {
        status: 400,
        code: "video_copy_context_missing",
      }
    );
  }

  const config = resolveAiConfig({
    runtimeConfig,
    defaultModel: DEFAULT_VIDEO_MODEL,
  });
  const referenceImages = await collectCopyReferenceImages(manifest);

  let copyPlan = await requestStructuredJson<CopyPlan>({
    operationName: "video copy generation",
    requestText: (attempt) =>
      referenceImages.length > 0
        ? requestAiVisionCompletion({
            config,
            operationName: "video copy generation",
            systemPrompt: [
              "You are a senior Chinese short-form commerce video creative director.",
              "Return exactly one valid JSON object.",
              "Do not use markdown code fences.",
              "Do not add commentary before or after JSON.",
            ].join(" "),
            userPrompt: buildVideoCopyPrompt({
              form,
              transcriptText,
              structureBlocks,
              visualAnalysis,
              attempt,
              hasReferenceFrames: true,
            }),
            images: referenceImages,
            maxTokens: 5000,
            temperature: 0.35,
          })
        : requestAiTextCompletion({
            config,
            operationName: "video copy generation",
            systemPrompt: [
              "You are a senior Chinese short-form commerce video creative director.",
              "Return exactly one valid JSON object.",
              "Do not use markdown code fences.",
              "Do not add commentary before or after JSON.",
            ].join(" "),
            userPrompt: buildVideoCopyPrompt({
              form,
              transcriptText,
              structureBlocks,
              visualAnalysis,
              attempt,
              hasReferenceFrames: false,
            }),
            maxTokens: 5000,
            temperature: 0.35,
          }),
    parseResult: parseVideoCopyPlan,
  });

  let qualityIssues = collectVideoCopyQualityIssues(copyPlan);

  if (qualityIssues.length > 0) {
    copyPlan = await requestStructuredJson<CopyPlan>({
      operationName: "video copy polish",
      requestText: (attempt) =>
        requestAiTextCompletion({
          config,
          operationName: "video copy polish",
          systemPrompt: [
            "You are a senior Chinese short-form commerce video creative director.",
            "You rewrite weak outputs into finished direct-response creative.",
            "Return exactly one valid JSON object.",
            "Do not use markdown code fences.",
            "Do not add commentary before or after JSON.",
          ].join(" "),
          userPrompt: buildVideoCopyPolishPrompt({
            form,
            copyPlan,
            issues: qualityIssues,
            attempt,
          }),
          maxTokens: 6000,
          temperature: 0.4,
        }),
      parseResult: parseVideoCopyPlan,
    });

    qualityIssues = collectVideoCopyQualityIssues(copyPlan);
  }

  if (qualityIssues.length > 0) {
    throw new RouteError(
      `Video copy generation returned a script that still needs manual cleanup: ${qualityIssues
        .slice(0, 4)
        .join(" / ")}`,
      {
        status: 502,
        code: "video_copy_quality_failed",
        retryable: true,
      }
    );
  }

  return { copy_plan: copyPlan };
}

export async function readVideoOutputFile(
  pathSegments: string[]
): Promise<{ body: Buffer; contentType: string }> {
  const outputRoot = getVideoOutputRoot();
  const safePath = resolveOutputPath(outputRoot, pathSegments);

  let body: Buffer;
  try {
    body = await fs.readFile(/*turbopackIgnore: true*/ safePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new RouteError("Video output file was not found.", {
        status: 404,
        code: "video_output_not_found",
      });
    }

    throw error;
  }

  return {
    body,
    contentType: contentTypeForPath(safePath),
  };
}

function getVideoOutputRoot(): string {
  const configured = process.env.VIDEO_OUTPUT_ROOT?.trim();
  if (configured) {
    return path.resolve(/*turbopackIgnore: true*/ configured);
  }

  if (process.env.VERCEL) {
    return path.join(os.tmpdir(), "amazon-atlas-video-output");
  }

  return path.join(/*turbopackIgnore: true*/ process.cwd(), ".video-output");
}

function collectUploadFiles(
  formData: FormData,
  ignoredField: string
): Record<string, File[]> {
  const uploads: Record<string, File[]> = {};

  for (const [key, value] of formData.entries()) {
    if (key === ignoredField || !isFileLike(value) || value.size <= 0) {
      continue;
    }

    uploads[key] = uploads[key] ?? [];
    uploads[key].push(value);
  }

  return uploads;
}

async function createVideoTaskFromPayload(
  rawPayload: Record<string, unknown>,
  uploadedAssets: Record<string, File[]>
): Promise<VideoGenerationTaskWire> {
  const normalizedPayload = normalizeTaskPayload(rawPayload);
  const model = getVideoModel(normalizedPayload.model_id);
  const inputMode = getInputModeCapability(model, normalizedPayload.input_mode);
  validateUploadedAssets(inputMode, uploadedAssets);

  const outputRoot = getVideoOutputRoot();
  const taskId = `video-task-${createTimestamp()}-${randomUUID().slice(0, 8)}`;
  const taskDir = path.join(
    /*turbopackIgnore: true*/ outputRoot,
    "video-generation",
    "tasks",
    taskId
  );
  const inputsDir = path.join(/*turbopackIgnore: true*/ taskDir, "inputs");
  await fs.mkdir(inputsDir, { recursive: true });

  const savedAssets: SavedVideoAsset[] = [];
  for (const slot of inputMode.asset_slots) {
    const files = uploadedAssets[slot.id] ?? [];
    if (files.length === 0) {
      continue;
    }

    const slotDir = path.join(/*turbopackIgnore: true*/ inputsDir, slot.id);
    await fs.mkdir(slotDir, { recursive: true });

    for (const [index, file] of files.entries()) {
      const safeName = `${String(index + 1).padStart(2, "0")}-${safeFileName(
        file.name || `${slot.id}-${index + 1}.png`,
        `${slot.id}.png`
      )}`;
      const targetPath = path.join(/*turbopackIgnore: true*/ slotDir, safeName);
      await writeFileUpload(file, targetPath);

      savedAssets.push({
        slot_id: slot.id,
        label: slot.label,
        kind: "image",
        name: file.name || safeName,
        size_bytes: file.size,
        relative_path: toOutputRelativePath(outputRoot, targetPath),
      });
    }
  }

  const nowText = isoNow();
  const task: VideoGenerationTaskWire = {
    task_id: taskId,
    model_id: model.id,
    model_name: model.name,
    provider: model.provider,
    integration_status: model.integration_status,
    input_mode: normalizedPayload.input_mode,
    status: "waiting_provider",
    status_label: "等待真实模型接入",
    status_detail:
      "任务创建、参数校验、素材入库和状态查询已在 Next.js API 中打通；真实视频生成 Provider 尚未接入。",
    created_at: nowText,
    updated_at: nowText,
    prompt: normalizedPayload.prompt,
    negative_prompt: normalizedPayload.negative_prompt,
    parameters: normalizedPayload.parameters,
    assets: savedAssets,
    provider_request_preview: buildProviderRequestPreview(
      model,
      normalizedPayload,
      savedAssets
    ),
    result: {
      videos: [],
      placeholder_message:
        "当前任务已建档，但还没有真实视频结果。接入 Runway / Kling / Veo 等供应商后，这里会返回视频 URL 和缩略图信息。",
      next_step:
        "下一步只需要在 provider 调用层补齐 submit / poll 逻辑，并把结果回写到当前任务结构。",
    },
  };

  await fs.writeFile(
    path.join(/*turbopackIgnore: true*/ taskDir, "task.json"),
    JSON.stringify(task, null, 2),
    "utf8"
  );

  return task;
}

function normalizeTaskPayload(
  rawPayload: Record<string, unknown>
): NormalizedVideoTaskPayload {
  const modelId = normalizeStringValue(rawPayload.model_id);
  if (!modelId) {
    throw new RouteError("Choose a video generation model.", {
      status: 400,
      code: "video_model_required",
    });
  }

  const rawInputMode = normalizeStringValue(rawPayload.input_mode);
  if (!SUPPORTED_INPUT_MODES.has(rawInputMode as VideoInputMode)) {
    throw new RouteError("The selected video input mode is not supported.", {
      status: 400,
      code: "video_input_mode_invalid",
    });
  }
  const inputMode = rawInputMode as VideoInputMode;

  const prompt = normalizeStringValue(rawPayload.prompt);
  if (!prompt) {
    throw new RouteError("Video prompt is required.", {
      status: 400,
      code: "video_prompt_required",
    });
  }

  const model = getVideoModel(modelId);
  getInputModeCapability(model, inputMode);

  const aspectRatio = normalizeStringValue(rawPayload.aspect_ratio);
  if (!model.supported_aspect_ratios.includes(aspectRatio)) {
    throw new RouteError("The selected aspect ratio is not supported by this model.", {
      status: 400,
      code: "video_aspect_ratio_invalid",
    });
  }

  const quality = normalizeStringValue(rawPayload.quality);
  if (!model.qualities.some((item) => item.id === quality)) {
    throw new RouteError("The selected quality is not supported by this model.", {
      status: 400,
      code: "video_quality_invalid",
    });
  }

  const durationSeconds = parseInteger(rawPayload.duration_seconds, "duration_seconds");
  const duration = model.duration;
  if (
    durationSeconds < duration.min_seconds ||
    durationSeconds > duration.max_seconds ||
    (durationSeconds - duration.min_seconds) % duration.step_seconds !== 0
  ) {
    throw new RouteError("The selected duration is not supported by this model.", {
      status: 400,
      code: "video_duration_invalid",
    });
  }

  const parameterCapabilities = new Map(
    model.supported_parameters.map((parameter) => [parameter.key, parameter])
  );
  const parameters: Record<string, number | string> = {
    aspect_ratio: aspectRatio,
    duration_seconds: durationSeconds,
    quality,
  };

  const negativePrompt = normalizeStringValue(rawPayload.negative_prompt, {
    allowEmpty: true,
  });
  if (negativePrompt) {
    if (!parameterCapabilities.has("negative_prompt")) {
      throw new RouteError(`${model.name} does not support negative prompts.`, {
        status: 400,
        code: "video_parameter_unsupported",
      });
    }
    parameters.negative_prompt = negativePrompt;
  }

  const seed = rawPayload.seed;
  if (seed !== undefined && seed !== null && seed !== "") {
    if (!parameterCapabilities.has("seed")) {
      throw new RouteError(`${model.name} does not support seed.`, {
        status: 400,
        code: "video_parameter_unsupported",
      });
    }
    parameters.seed = parseInteger(seed, "seed");
  }

  for (const key of ["motion_strength", "camera_strength", "style_strength"] as const) {
    const value = rawPayload[key];
    if (value === undefined || value === null || value === "") {
      continue;
    }

    const capability = parameterCapabilities.get(key);
    if (!capability) {
      throw new RouteError(`${model.name} does not support ${key}.`, {
        status: 400,
        code: "video_parameter_unsupported",
      });
    }

    parameters[key] = parseBoundedFloat(value, capability);
  }

  return {
    model_id: modelId,
    input_mode: inputMode,
    prompt,
    negative_prompt:
      typeof parameters.negative_prompt === "string"
        ? parameters.negative_prompt
        : undefined,
    parameters,
  };
}

function validateUploadedAssets(
  inputMode: VideoModelInputModeWire,
  uploadedAssets: Record<string, File[]>
): void {
  const slotCapabilities = new Map(
    inputMode.asset_slots.map((slot) => [slot.id, slot])
  );

  for (const slotId of Object.keys(uploadedAssets)) {
    if (!slotCapabilities.has(slotId)) {
      throw new RouteError(`Current input mode does not accept asset slot: ${slotId}`, {
        status: 400,
        code: "video_asset_slot_invalid",
      });
    }
  }

  for (const slot of inputMode.asset_slots) {
    const files = uploadedAssets[slot.id] ?? [];
    if (!slot.optional && files.length < slot.min_files) {
      throw new RouteError(`Upload required asset: ${slot.label}`, {
        status: 400,
        code: "video_asset_required",
      });
    }

    if (files.length > slot.max_files) {
      throw new RouteError(`${slot.label} supports at most ${slot.max_files} files.`, {
        status: 400,
        code: "video_asset_too_many",
      });
    }
  }
}

function buildProviderRequestPreview(
  model: VideoModelCapabilityWire,
  normalizedPayload: NormalizedVideoTaskPayload,
  savedAssets: SavedVideoAsset[]
): Record<string, unknown> {
  return {
    provider: model.provider,
    model: model.id,
    input_mode: normalizedPayload.input_mode,
    prompt: normalizedPayload.prompt,
    parameters: normalizedPayload.parameters,
    assets: savedAssets.map((asset) => ({
      slot_id: asset.slot_id,
      name: asset.name,
      relative_path: asset.relative_path,
    })),
    dispatch_ready: false,
  };
}

function withVideoTaskUrls(
  task: VideoGenerationTaskWire,
  request: Request
): VideoGenerationTaskWire {
  const decorated = structuredClone(task);

  for (const asset of decorated.assets) {
    if (asset.relative_path && !asset.url) {
      asset.url = buildOutputUrl(request, asset.relative_path);
    }
  }

  for (const video of decorated.result.videos) {
    if (video.relative_path && !video.url) {
      video.url = buildOutputUrl(request, video.relative_path);
    }
  }

  return decorated;
}

function withFrameUrls(manifest: VideoManifestWire, request: Request): VideoManifestWire {
  const decorated = structuredClone(manifest);

  decorated.frames = decorated.frames.map((frame) => ({
    ...frame,
    src:
      frame.src ??
      (frame.relative_path ? buildOutputUrl(request, frame.relative_path) : undefined),
  }));

  return decorated;
}

async function probeVideo(videoPath: string): Promise<VideoProbeResult> {
  const ffprobeBinary = getFfprobeBinary();
  if (!ffprobeBinary) {
    throw new Error("ffprobe binary is unavailable.");
  }

  const { stdout } = await execFileAsync(
    ffprobeBinary,
    [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      videoPath,
    ],
    { timeout: FFMPEG_TIMEOUT_MS, windowsHide: true }
  );
  const payload = JSON.parse(stdout.toString()) as unknown;

  if (!isRecord(payload)) {
    throw new Error("ffprobe returned an invalid payload.");
  }

  const streams = Array.isArray(payload.streams) ? payload.streams : [];
  const videoStream = streams.find(
    (stream): stream is Record<string, unknown> =>
      isRecord(stream) && stream.codec_type === "video"
  );
  const format = isRecord(payload.format) ? payload.format : {};

  return {
    durationSeconds: roundNumber(
      normalizeNumberValue(videoStream?.duration ?? format.duration, { fallback: 0 }),
      2
    ),
    frameCount: normalizeNumberValue(videoStream?.nb_frames, {
      integer: true,
      fallback: 0,
    }),
    fps: parseFrameRate(videoStream?.avg_frame_rate ?? videoStream?.r_frame_rate),
    width: normalizeNumberValue(videoStream?.width, { integer: true, fallback: 0 }),
    height: normalizeNumberValue(videoStream?.height, { integer: true, fallback: 0 }),
  };
}

async function extractFrames(options: {
  inputPath: string;
  jobDir: string;
  jobId: string;
  durationSeconds: number;
  intervalSeconds: number;
  maxFrames: number;
}): Promise<ManifestFrame[]> {
  const ffmpegBinary = getFfmpegBinary();
  if (!ffmpegBinary) {
    throw new Error("ffmpeg binary is unavailable.");
  }

  const timestamps = buildFrameTimestamps(
    options.durationSeconds,
    options.intervalSeconds,
    options.maxFrames
  );
  const outputRoot = getVideoOutputRoot();
  const frames: ManifestFrame[] = [];

  for (const [index, timestamp] of timestamps.entries()) {
    const file = `frame_${String(index).padStart(3, "0")}_${timestamp
      .toFixed(2)
      .replace(".", "-")}s.jpg`;
    const outputPath = path.join(/*turbopackIgnore: true*/ options.jobDir, file);

    await execFileAsync(
      ffmpegBinary,
      [
        "-y",
        "-ss",
        timestamp.toFixed(2),
        "-i",
        options.inputPath,
        "-frames:v",
        "1",
        "-q:v",
        "3",
        outputPath,
      ],
      { timeout: FFMPEG_TIMEOUT_MS, windowsHide: true }
    );

    frames.push({
      index,
      timestamp_seconds: roundNumber(timestamp, 2),
      file,
      relative_path: toOutputRelativePath(outputRoot, outputPath),
    });
  }

  return frames;
}

async function transcribeVideo(
  videoPath: string,
  fileName: string
): Promise<{
  text: string;
  segments: TranscriptSegment[];
  language: string;
  note: string;
}> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return {
      text: "",
      segments: [],
      language: "unknown",
      note: "未配置 OPENAI_API_KEY，已跳过音频转写；可以手动补充字幕后继续生成脚本。",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TRANSCRIBE_TIMEOUT_MS);

  try {
    const body = new FormData();
    const blob = new Blob([await fs.readFile(/*turbopackIgnore: true*/ videoPath)], {
      type: contentTypeForPath(videoPath),
    });
    body.append("file", blob, fileName || "video.mp4");
    body.append("model", process.env.OPENAI_TRANSCRIBE_MODEL || DEFAULT_TRANSCRIBE_MODEL);
    body.append("response_format", "verbose_json");
    body.append("temperature", "0");

    const response = await fetch(buildOpenAiAudioTranscriptionUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body,
      signal: controller.signal,
    });

    const rawText = await response.text();
    const payload = parseJson(rawText);

    if (!response.ok) {
      throw new Error(extractErrorMessage(payload) || `HTTP ${response.status}`);
    }

    if (!isRecord(payload)) {
      throw new Error("OpenAI transcription returned an invalid payload.");
    }

    const segments = normalizeTranscriptSegments(payload.segments);
    const text =
      normalizeStringValue(payload.text, { allowEmpty: true }) ||
      segments.map((segment) => segment.text).join("\n");

    return {
      text,
      segments,
      language: normalizeStringValue(payload.language, {
        allowEmpty: true,
        fallback: "unknown",
      }),
      note: `已使用 ${process.env.OPENAI_TRANSCRIBE_MODEL || DEFAULT_TRANSCRIBE_MODEL} 完成音频转写。`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function analyzeFramesWithAi(options: {
  frames: ManifestFrame[];
  jobId: string;
  runtimeConfig?: AiRuntimeConfig;
  transcriptText: string;
  durationSeconds: number;
}): Promise<VideoVisualAnalysis | null> {
  if (options.frames.length === 0) {
    return null;
  }

  const sampledFrames = sampleFrames(options.frames, 6);
  const images: AiImageInput[] = await Promise.all(
    sampledFrames.map(async (frame) => {
      const framePath = path.join(
        /*turbopackIgnore: true*/ getVideoOutputRoot(),
        options.jobId,
        frame.file
      );
      return {
        data: (await fs.readFile(/*turbopackIgnore: true*/ framePath)).toString("base64"),
        mediaType: "image/jpeg",
      };
    })
  );
  const config = resolveAiConfig({
    runtimeConfig: options.runtimeConfig,
    defaultModel: DEFAULT_VIDEO_MODEL,
  });

  return requestStructuredJson<VideoVisualAnalysis>({
    operationName: "video frame analysis",
    requestText: (attempt) =>
      requestAiVisionCompletion({
        config,
        operationName: "video frame analysis",
        systemPrompt: [
          "You analyze short-form product video key frames for an internal commerce workflow.",
          "Return exactly one valid JSON object.",
          "Do not use markdown code fences.",
        ].join(" "),
        userPrompt: buildFrameAnalysisPrompt({
          frames: sampledFrames,
          transcriptText: options.transcriptText,
          durationSeconds: options.durationSeconds,
          attempt,
        }),
        images,
        maxTokens: 2400,
        temperature: 0.2,
      }),
    parseResult: parseVisualAnalysis,
  });
}

function buildFrameAnalysisPrompt(options: {
  frames: ManifestFrame[];
  transcriptText: string;
  durationSeconds: number;
  attempt: number;
}): string {
  return `
Analyze these key frames from a short-form product video. Answer in Simplified Chinese.

The images are attached in this order:
${options.frames
  .map((frame) => `- frame_index ${frame.index}, ${frame.timestamp_seconds}s`)
  .join("\n")}

Transcript excerpt:
${options.transcriptText.slice(0, 1800) || "No transcript was available."}

Video duration: ${options.durationSeconds || "unknown"} seconds.

Return exactly one JSON object:
{
  "summary": "overall visual takeaway",
  "visual_style": "visual style and production feel",
  "hook_strategy": "how the opening frames stop the scroll",
  "product_presence": "how and when the product appears",
  "proof_signals": "visible proof, comparison, testimonial, result, or trust signal",
  "cta_observation": "how the ending drives action",
  "frame_observations": [
    {
      "frame_index": 0,
      "timestamp_seconds": 0,
      "description": "what is visible",
      "marketing_role": "hook / pain / solution / trust / buy",
      "shot_type": "close-up / product demo / before-after / testimonial / CTA",
      "selling_signal": "what value this frame communicates",
      "note": "why this frame matters for remaking the video"
    }
  ]
}

Rules:
- Use only visible evidence from the frames plus the transcript excerpt.
- If a detail is uncertain, say it is visually inferred.
- Keep every human-readable field in natural Simplified Chinese.
- Return JSON only.
${getRetryPromptSuffix(options.attempt)}
  `.trim();
}

function parseVisualAnalysis(value: unknown): VideoVisualAnalysis {
  if (!isRecord(value)) {
    throw new RouteError("Video frame analysis returned an invalid JSON shape.", {
      status: 502,
      code: "video_visual_invalid_shape",
      retryable: true,
    });
  }

  const frameObservations = Array.isArray(value.frame_observations)
    ? value.frame_observations
        .map((item) => normalizeFrameObservation(item))
        .filter((item): item is VisualFrameObservation => item !== null)
    : [];

  return {
    summary: normalizeStringValue(value.summary, { allowEmpty: true }),
    visual_style: normalizeStringValue(value.visual_style, { allowEmpty: true }),
    hook_strategy: normalizeStringValue(value.hook_strategy, { allowEmpty: true }),
    product_presence: normalizeStringValue(value.product_presence, { allowEmpty: true }),
    proof_signals: normalizeStringValue(value.proof_signals, { allowEmpty: true }),
    cta_observation: normalizeStringValue(value.cta_observation, { allowEmpty: true }),
    frame_observations: frameObservations,
  };
}

function normalizeFrameObservation(value: unknown): VisualFrameObservation | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    frame_index: normalizeNumberValue(value.frame_index ?? value.frameIndex, {
      integer: true,
      fallback: 0,
    }),
    timestamp_seconds: normalizeNumberValue(
      value.timestamp_seconds ?? value.timestampSeconds,
      { fallback: 0 }
    ),
    description: normalizeStringValue(value.description, { allowEmpty: true }),
    marketing_role: normalizeStringValue(value.marketing_role ?? value.marketingRole, {
      allowEmpty: true,
    }),
    shot_type: normalizeStringValue(value.shot_type ?? value.shotType, {
      allowEmpty: true,
    }),
    selling_signal: normalizeStringValue(value.selling_signal ?? value.sellingSignal, {
      allowEmpty: true,
    }),
    note: normalizeStringValue(value.note, { allowEmpty: true }),
  };
}

function applyVisualNotesToFrames(
  frames: ManifestFrame[],
  visualAnalysis: VideoVisualAnalysis | null
): ManifestFrame[] {
  if (!visualAnalysis) {
    return frames;
  }

  const observations = new Map(
    visualAnalysis.frame_observations.map((observation) => [
      observation.frame_index,
      observation,
    ])
  );

  return frames.map((frame) => {
    const observation = observations.get(frame.index);
    return {
      ...frame,
      note: observation?.note || observation?.description || frame.note,
    };
  });
}

function buildStructureBlocks(options: {
  transcriptSegments: TranscriptSegment[];
  visualAnalysis: VideoVisualAnalysis | null;
  frames: ManifestFrame[];
  durationSeconds: number;
}): VideoManifestWire["structure_blocks"] {
  if (options.transcriptSegments.length > 0) {
    return buildTranscriptStructureBlocks(options.transcriptSegments);
  }

  const observations = options.visualAnalysis?.frame_observations ?? [];
  if (observations.length > 0) {
    return observations.slice(0, 5).map((observation, index) => {
      const stage = normalizeStage(observation.marketing_role, index, observations.length);
      const meta = STAGE_META[stage];
      return {
        id: `block-${index + 1}`,
        stage,
        stage_label: meta.label,
        title: meta.title,
        summary:
          observation.selling_signal ||
          observation.description ||
          options.visualAnalysis?.summary ||
          meta.summary,
        summary_hint: meta.summary,
        recommendation: observation.note || meta.recommendation,
        transcript: "",
        start_seconds: observation.timestamp_seconds,
        end_seconds:
          observations[index + 1]?.timestamp_seconds ||
          options.durationSeconds ||
          observation.timestamp_seconds,
        confidence: 0.62,
        tags: meta.tags,
        segment_ids: [],
      };
    });
  }

  const fallbackStages: VideoStage[] = ["stop", "pain", "solution", "trust", "buy"];
  return fallbackStages
    .slice(0, Math.max(1, Math.min(options.frames.length, 5)))
    .map((stage, index, list) => {
      const meta = STAGE_META[stage];
      const startSeconds =
        list.length <= 1 ? 0 : (options.durationSeconds * index) / list.length;
      const endSeconds =
        list.length <= 1
          ? options.durationSeconds
          : (options.durationSeconds * (index + 1)) / list.length;

      return {
        id: `block-${index + 1}`,
        stage,
        stage_label: meta.label,
        title: meta.title,
        summary: meta.summary,
        summary_hint: meta.summary,
        recommendation: meta.recommendation,
        transcript: "",
        start_seconds: roundNumber(startSeconds, 2),
        end_seconds: roundNumber(endSeconds, 2),
        confidence: 0.42,
        tags: meta.tags,
        segment_ids: [],
      };
    });
}

function buildTranscriptStructureBlocks(
  transcriptSegments: TranscriptSegment[]
): VideoManifestWire["structure_blocks"] {
  const classified = transcriptSegments.map((segment, index) => {
    const stage = classifyStage(segment.text, index, transcriptSegments.length);
    return {
      ...segment,
      stage,
      confidence: index === 0 || index === transcriptSegments.length - 1 ? 0.72 : 0.58,
    };
  });

  const blocks: Array<{
    stage: VideoStage;
    items: Array<TranscriptSegment & { confidence: number; stage: VideoStage }>;
  }> = [];

  for (const item of classified) {
    const lastBlock = blocks.at(-1);
    if (!lastBlock || lastBlock.stage !== item.stage) {
      blocks.push({ stage: item.stage, items: [item] });
    } else {
      lastBlock.items.push(item);
    }
  }

  return blocks.map((block, index) => {
    const meta = STAGE_META[block.stage];
    const transcript = block.items.map((item) => item.text).join("\n");
    const startSeconds = block.items[0]?.start_seconds ?? 0;
    const endSeconds = block.items.at(-1)?.end_seconds ?? startSeconds;

    return {
      id: `block-${index + 1}`,
      stage: block.stage,
      stage_label: meta.label,
      title: meta.title,
      summary: trimText(transcript, 120) || meta.summary,
      summary_hint: meta.summary,
      recommendation: meta.recommendation,
      transcript,
      start_seconds: startSeconds,
      end_seconds: endSeconds,
      confidence: roundNumber(
        block.items.reduce((sum, item) => sum + item.confidence, 0) /
          Math.max(1, block.items.length),
        2
      ),
      tags: meta.tags,
      segment_ids: block.items.map((item) => item.id),
    };
  });
}

function classifyStage(text: string, index: number, total: number): VideoStage {
  const normalized = text.toLowerCase();
  const progress = index / Math.max(total - 1, 1);

  if (/buy|order|click|shop|purchase|下单|链接|购买|点击|马上|现在/.test(normalized)) {
    return "buy";
  }
  if (/proof|result|review|compare|trust|证明|结果|对比|反馈|数据/.test(normalized)) {
    return "trust";
  }
  if (/solution|product|use|feature|解决|产品|功能|使用|换成/.test(normalized)) {
    return "solution";
  }
  if (/problem|pain|risk|worry|issue|问题|痛|麻烦|风险|担心|困扰/.test(normalized)) {
    return index === 0 ? "stop" : "pain";
  }
  if (progress >= 0.82) {
    return "buy";
  }
  if (progress >= 0.58) {
    return "trust";
  }
  if (progress >= 0.32) {
    return "solution";
  }
  return index === 0 ? "stop" : "pain";
}

async function collectCopyReferenceImages(
  manifest: Record<string, unknown>
): Promise<AiImageInput[]> {
  const jobId =
    normalizeStringValue(manifest.job_id, { allowEmpty: true }) ||
    normalizeStringValue(manifest.jobId, { allowEmpty: true });

  if (!jobId) {
    return [];
  }

  const rawFrames = Array.isArray(manifest.frames) ? manifest.frames : [];
  const frames = rawFrames
    .map((item) => normalizeManifestFrame(item))
    .filter((item): item is ManifestFrame => item !== null);

  if (frames.length === 0) {
    return [];
  }

  const sampledFrames = sampleFrames(frames, 4);
  const images: AiImageInput[] = [];

  for (const frame of sampledFrames) {
    if (!frame.file) {
      continue;
    }

    const framePath = path.join(
      /*turbopackIgnore: true*/ getVideoOutputRoot(),
      jobId,
      frame.file
    );

    try {
      const buffer = await fs.readFile(/*turbopackIgnore: true*/ framePath);
      images.push({
        data: buffer.toString("base64"),
        mediaType: contentTypeForPath(framePath),
      });
    } catch {
      continue;
    }
  }

  return images;
}

function normalizeManifestFrame(value: unknown): ManifestFrame | null {
  if (!isRecord(value)) {
    return null;
  }

  const file = normalizeStringValue(value.file, { allowEmpty: true });
  if (!file) {
    return null;
  }

  return {
    index: normalizeNumberValue(value.index, {
      min: 0,
      integer: true,
    }),
    timestamp_seconds: normalizeNumberValue(
      value.timestamp_seconds ?? value.timestampSeconds,
      { min: 0, fallback: 0 }
    ),
    file,
    relative_path: normalizeStringValue(value.relative_path ?? value.relativePath, {
      allowEmpty: true,
    }),
    src: normalizeStringValue(value.src, { allowEmpty: true }),
    note: normalizeStringValue(value.note, { allowEmpty: true }),
  };
}

function compactStructureBlocksForPrompt(blocks: unknown[]): unknown[] {
  return blocks
    .filter((item) => isRecord(item))
    .slice(0, 6)
    .map((item) => ({
      stage: normalizeStringValue(item.stage, { allowEmpty: true }),
      title: trimText(normalizeStringValue(item.title, { allowEmpty: true }), 60),
      summary: trimText(normalizeStringValue(item.summary, { allowEmpty: true }), 140),
      recommendation: trimText(
        normalizeStringValue(item.recommendation, { allowEmpty: true }),
        140
      ),
      transcript_excerpt: trimText(
        normalizeStringValue(item.transcript, { allowEmpty: true }),
        180
      ),
    }));
}

function compactVisualAnalysisForPrompt(
  value: Record<string, unknown>
): Record<string, unknown> {
  const frameObservations = Array.isArray(
    value.frame_observations ?? value.frameObservations
  )
    ? ((value.frame_observations ?? value.frameObservations) as unknown[])
        .filter((item) => isRecord(item))
        .slice(0, 4)
        .map((item) => ({
          frame_index: normalizeNumberValue(
            item.frame_index ?? item.frameIndex,
            { min: 0, integer: true }
          ),
          timestamp_seconds: normalizeNumberValue(
            item.timestamp_seconds ?? item.timestampSeconds,
            { min: 0, fallback: 0 }
          ),
          description: trimText(
            normalizeStringValue(item.description, { allowEmpty: true }),
            120
          ),
          marketing_role: trimText(
            normalizeStringValue(
              item.marketing_role ?? item.marketingRole,
              { allowEmpty: true }
            ),
            60
          ),
          selling_signal: trimText(
            normalizeStringValue(
              item.selling_signal ?? item.sellingSignal,
              { allowEmpty: true }
            ),
            80
          ),
        }))
    : [];

  return {
    summary: trimText(normalizeStringValue(value.summary, { allowEmpty: true }), 140),
    visual_style: trimText(
      normalizeStringValue(value.visual_style ?? value.visualStyle, {
        allowEmpty: true,
      }),
      100
    ),
    hook_strategy: trimText(
      normalizeStringValue(value.hook_strategy ?? value.hookStrategy, {
        allowEmpty: true,
      }),
      100
    ),
    product_presence: trimText(
      normalizeStringValue(value.product_presence ?? value.productPresence, {
        allowEmpty: true,
      }),
      100
    ),
    proof_signals: trimText(
      normalizeStringValue(value.proof_signals ?? value.proofSignals, {
        allowEmpty: true,
      }),
      100
    ),
    cta_observation: trimText(
      normalizeStringValue(value.cta_observation ?? value.ctaObservation, {
        allowEmpty: true,
      }),
      100
    ),
    frame_observations: frameObservations,
  };
}

function collectVideoCopyQualityIssues(copyPlan: CopyPlan): string[] {
  const texts = [
    copyPlan.summary,
    copyPlan.prompt,
    ...copyPlan.scriptDrafts.flatMap((draft) => [
      draft.headline,
      draft.summary,
      draft.fullScript,
      draft.caption,
      draft.tone,
      draft.positioning,
      ...draft.stageLines.map((line) => line.line),
    ]),
  ]
    .map((item) => item.trim())
    .filter(Boolean);

  if (texts.length === 0) {
    return ["No usable creative text was returned."];
  }

  const combined = texts.join("\n");
  const issues: string[] = [];
  const bannedPhrases = [
    "如果你的用户",
    "这条视频就该",
    "重点放大",
    "这里重点",
    "再补一个",
    "这版脚本",
    "这一版",
    "应该先把",
    "营销策略",
    "脚本说明",
  ];

  for (const phrase of bannedPhrases) {
    if (combined.includes(phrase)) {
      issues.push(`Still contains analysis-style phrasing: ${phrase}`);
    }
  }

  const englishChunks = combined.match(
    /(?:\b[A-Za-z][A-Za-z-]{2,}\b(?:\s+|$)){4,}/g
  );
  if (englishChunks?.length) {
    issues.push("Contains long English passages instead of natural Chinese creative.");
  }

  const asciiLetters = Array.from(combined).filter((char) =>
    /[A-Za-z]/.test(char)
  ).length;
  const cjkChars = (combined.match(/[\u4e00-\u9fff]/g) || []).length;
  if (asciiLetters >= 36 && asciiLetters > Math.max(18, Math.floor(cjkChars / 4))) {
    issues.push("English ratio is too high for a Chinese short-video script.");
  }

  if (copyPlan.scriptDrafts.length < 3) {
    issues.push("Expected at least 3 script drafts.");
  }

  for (const [index, draft] of copyPlan.scriptDrafts.entries()) {
    if (draft.fullScript.trim().length < 80) {
      issues.push(`Draft ${index + 1} is too short to be a finished script.`);
    }

    if (!draft.stageLines.length) {
      issues.push(`Draft ${index + 1} is missing stage lines.`);
    }

    const longLines = draft.fullScript
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length >= 70);
    if (longLines.length >= 2) {
      issues.push(`Draft ${index + 1} still reads like dense notes instead of spoken copy.`);
    }
  }

  return Array.from(new Set(issues));
}

function buildVideoCopyPolishPrompt(options: {
  form: Record<string, unknown>;
  copyPlan: CopyPlan;
  issues: string[];
  attempt: number;
}): string {
  const productInfo = {
    product_name: normalizeStringValue(options.form.productName, { allowEmpty: true }),
    category: normalizeStringValue(options.form.category, { allowEmpty: true }),
    market: normalizeStringValue(options.form.market, { allowEmpty: true }),
    audience: normalizeStringValue(options.form.audience, { allowEmpty: true }),
    problem: normalizeStringValue(options.form.problem, { allowEmpty: true }),
    selling_points: normalizeStringValue(options.form.sellingPoints, {
      allowEmpty: true,
    }),
    proof_assets: normalizeStringValue(options.form.proofAssets, { allowEmpty: true }),
    hero_angle: normalizeStringValue(options.form.heroAngle, { allowEmpty: true }),
    tone: normalizeStringValue(options.form.tone, { allowEmpty: true }),
    desired_length: normalizeStringValue(options.form.desiredLength, {
      allowEmpty: true,
    }),
  };

  return `
Rewrite the JSON below into finished Chinese direct-response video creative.

Current quality issues:
${options.issues.map((issue) => `- ${issue}`).join("\n")}

Product info:
${JSON.stringify(productInfo, null, 2)}

Keep the same top-level JSON shape and keep every existing id stable.

Hard rules:
- All human-readable content must be natural spoken Simplified Chinese.
- Do not write analysis notes, consultant language, or team instructions.
- Every full_script must read like something a creator can shoot directly.
- The prompt field must be a ready-to-paste Chinese AI video prompt with shot order, subject, action, product reveal, proof beats, lighting, camera movement, subtitle feel, and CTA.
- Each draft should feel materially different in angle, not minor wording variants.
- Return JSON only.
${getRetryPromptSuffix(options.attempt)}

Current JSON:
${JSON.stringify(options.copyPlan, null, 2)}
  `.trim();
}

function buildVideoCopyPrompt(options: {
  form: Record<string, unknown>;
  transcriptText: string;
  structureBlocks: unknown[];
  visualAnalysis: Record<string, unknown>;
  attempt: number;
  hasReferenceFrames: boolean;
}): string {
  const compactStructureBlocks = compactStructureBlocksForPrompt(
    options.structureBlocks
  );
  const compactVisualAnalysis = compactVisualAnalysisForPrompt(
    options.visualAnalysis
  );
  const productInfo = {
    product_name: normalizeStringValue(options.form.productName, { allowEmpty: true }),
    category: normalizeStringValue(options.form.category, { allowEmpty: true }),
    market: normalizeStringValue(options.form.market, { allowEmpty: true }),
    audience: normalizeStringValue(options.form.audience, { allowEmpty: true }),
    problem: normalizeStringValue(options.form.problem, { allowEmpty: true }),
    selling_points: normalizeStringValue(options.form.sellingPoints, {
      allowEmpty: true,
    }),
    proof_assets: normalizeStringValue(options.form.proofAssets, { allowEmpty: true }),
    hero_angle: normalizeStringValue(options.form.heroAngle, { allowEmpty: true }),
    tone: normalizeStringValue(options.form.tone, { allowEmpty: true }),
    desired_length: normalizeStringValue(options.form.desiredLength, {
      allowEmpty: true,
    }),
  };

  return `
Create finished creative assets for a short-form product video remake.

Your job is not to explain strategy. Your job is to deliver ready-to-use creative output in natural Simplified Chinese.

Product info:
${JSON.stringify(productInfo, null, 2)}

Transcript:
${options.transcriptText || "No transcript was available. Use visual analysis and the product info."}

Structure blocks:
${JSON.stringify(compactStructureBlocks, null, 2)}

Visual analysis:
${JSON.stringify(compactVisualAnalysis, null, 2)}

Return exactly one JSON object:
{
  "summary": "one-sentence Chinese creative direction",
  "prompt": "Chinese AI video prompt ready to paste into a text-to-video tool",
  "script_angles": [
    {
      "id": "risk",
      "name": "Chinese angle name",
      "positioning": "one-line Chinese positioning",
      "tone": "Chinese tone label",
      "hook": "Chinese hook",
      "bridge": "Chinese bridge",
      "proof": "Chinese proof",
      "cta": "Chinese CTA",
      "tags": ["tag1", "tag2"]
    }
  ],
  "script_drafts": [
    {
      "id": "risk",
      "angle_name": "Chinese angle name",
      "positioning": "one-line Chinese positioning",
      "tone": "Chinese tone label",
      "headline": "Chinese shoot title",
      "summary": "one-line Chinese why this version works",
      "full_script": "Chinese finished production script with hook, voiceover, on-screen text, shot list, CTA",
      "caption": "short Chinese internal style tag",
      "stage_lines": [
        {"stage": "stop", "label": "Opening", "line": "short spoken line"},
        {"stage": "pain", "label": "Pain", "line": "short spoken line"},
        {"stage": "solution", "label": "Solution", "line": "short spoken line"},
        {"stage": "trust", "label": "Proof", "line": "short spoken line"},
        {"stage": "buy", "label": "CTA", "line": "short spoken line"}
      ]
    }
  ]
}

Hard rules:
- All human-readable content must be natural spoken Simplified Chinese.
- English is allowed only for unavoidable proper nouns such as brand names or product names.
- Do not write consultant tone, analysis prose, or team instructions.
- Every full_script must be directly usable for filming or for feeding into an AI video tool.
- The prompt field must describe shot order, visual subject, action, product reveal, proof moments, subtitle feel, lighting, camera movement, and CTA beat.
- Reference frames are attached in chronological order${options.hasReferenceFrames ? " and must be used as visual evidence." : "."}
- Give at least 3 distinct script angles and 3 script drafts.
- Return JSON only.
${getRetryPromptSuffix(options.attempt)}
  `.trim();
}

function parseVideoCopyPlan(value: unknown): CopyPlan {
  if (!isRecord(value)) {
    throw new RouteError("Video copy generation returned an invalid JSON shape.", {
      status: 502,
      code: "video_copy_invalid_shape",
      retryable: true,
    });
  }

  const scriptAngles = Array.isArray(value.script_angles)
    ? value.script_angles
        .map((item, index) => normalizeScriptAngle(item, index))
        .filter((item): item is CopyPlan["scriptAngles"][number] => item !== null)
    : [];
  const scriptDrafts = Array.isArray(value.script_drafts)
    ? value.script_drafts
        .map((item, index) => normalizeScriptDraft(item, index))
        .filter((item): item is CopyPlan["scriptDrafts"][number] => item !== null)
    : [];

  if (scriptAngles.length === 0 || scriptDrafts.length === 0) {
    throw new RouteError("Video copy generation returned an empty plan.", {
      status: 502,
      code: "video_copy_empty_result",
      retryable: true,
    });
  }

  return {
    summary: normalizeStringValue(value.summary, { allowEmpty: true }),
    prompt: normalizeStringValue(value.prompt, { allowEmpty: true }),
    scriptAngles,
    scriptDrafts,
  };
}

function normalizeScriptAngle(
  value: unknown,
  index: number
): CopyPlan["scriptAngles"][number] | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    id: normalizeStringValue(value.id, {
      allowEmpty: true,
      fallback: `angle-${index + 1}`,
    }),
    name: normalizeStringValue(value.name, {
      allowEmpty: true,
      fallback: `角度 ${index + 1}`,
    }),
    positioning: normalizeStringValue(value.positioning, { allowEmpty: true }),
    tone: normalizeStringValue(value.tone, { allowEmpty: true }),
    hook: normalizeStringValue(value.hook, { allowEmpty: true }),
    bridge: normalizeStringValue(value.bridge, { allowEmpty: true }),
    proof: normalizeStringValue(value.proof, { allowEmpty: true }),
    cta: normalizeStringValue(value.cta, { allowEmpty: true }),
    tags: normalizeTextList(value.tags, { maxItems: 5, unique: true }),
  };
}

function normalizeScriptDraft(
  value: unknown,
  index: number
): CopyPlan["scriptDrafts"][number] | null {
  if (!isRecord(value)) {
    return null;
  }

  const fullScript = normalizeStringValue(value.full_script ?? value.fullScript, {
    allowEmpty: true,
  });
  const headline = normalizeStringValue(value.headline, { allowEmpty: true });
  if (!fullScript && !headline) {
    return null;
  }

  const rawStageLines = Array.isArray(value.stage_lines ?? value.stageLines)
    ? ((value.stage_lines ?? value.stageLines) as unknown[])
    : [];

  return {
    id: normalizeStringValue(value.id, {
      allowEmpty: true,
      fallback: `draft-${index + 1}`,
    }),
    angleName: normalizeStringValue(value.angle_name ?? value.angleName, {
      allowEmpty: true,
      fallback: `角度 ${index + 1}`,
    }),
    positioning: normalizeStringValue(value.positioning, { allowEmpty: true }),
    tone: normalizeStringValue(value.tone, { allowEmpty: true }),
    headline,
    summary: normalizeStringValue(value.summary, { allowEmpty: true }),
    fullScript,
    caption: normalizeStringValue(value.caption, { allowEmpty: true }),
    stageLines: rawStageLines
      .map((item) => normalizeStageLine(item))
      .filter(
        (item): item is CopyPlan["scriptDrafts"][number]["stageLines"][number] =>
          item !== null
      ),
  };
}

function normalizeStageLine(
  value: unknown
): CopyPlan["scriptDrafts"][number]["stageLines"][number] | null {
  if (!isRecord(value)) {
    return null;
  }

  const line = normalizeStringValue(value.line, { allowEmpty: true });
  if (!line) {
    return null;
  }

  return {
    stage: normalizeStringValue(value.stage, { allowEmpty: true }),
    label: normalizeStringValue(value.label, { allowEmpty: true }),
    line,
  };
}

function readRequiredFile(formData: FormData, key: string): File {
  const value = formData.get(key);
  if (!isFileLike(value) || value.size <= 0) {
    throw new RouteError(`Missing required file field: ${key}`, {
      status: 400,
      code: "video_file_required",
    });
  }

  return value;
}

function validateVideoUpload(file: File): void {
  const maxBytes =
    normalizeNumberValue(process.env.VIDEO_MAX_UPLOAD_MB, {
      min: 1,
      max: 500,
      fallback: DEFAULT_VIDEO_MAX_UPLOAD_MB,
    }) *
    1024 *
    1024;

  if (file.size > maxBytes) {
    throw new RouteError(
      `Video is too large. The current limit is ${Math.round(maxBytes / 1024 / 1024)} MB.`,
      {
        status: 413,
        code: "video_file_too_large",
      }
    );
  }

  if (file.type && !file.type.startsWith("video/") && file.type !== "application/octet-stream") {
    throw new RouteError("Uploaded file must be a video.", {
      status: 400,
      code: "video_file_type_invalid",
    });
  }
}

function isFileLike(value: FormDataEntryValue | null): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    "arrayBuffer" in value &&
    "name" in value &&
    "size" in value
  );
}

async function writeFileUpload(file: File, targetPath: string): Promise<void> {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, Buffer.from(await file.arrayBuffer()));
}

function normalizeTranscriptSegments(value: unknown): TranscriptSegment[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index) => {
      if (!isRecord(item)) {
        return null;
      }

      const text = normalizeStringValue(item.text, { allowEmpty: true });
      if (!text) {
        return null;
      }

      return {
        id: normalizeStringValue(item.id, {
          allowEmpty: true,
          fallback: `seg-${index + 1}`,
        }),
        start_seconds: normalizeNumberValue(item.start, {
          fallback: normalizeNumberValue(item.start_seconds, { fallback: 0 }),
        }),
        end_seconds: normalizeNumberValue(item.end, {
          fallback: normalizeNumberValue(item.end_seconds, { fallback: 0 }),
        }),
        text,
      };
    })
    .filter((item): item is TranscriptSegment => item !== null);
}

function normalizeStage(value: string, index: number, total: number): VideoStage {
  const normalized = value.toLowerCase();

  if (/buy|cta|action|order|购买|行动|下单/.test(normalized)) {
    return "buy";
  }
  if (/trust|proof|result|compare|信任|证明|结果|对比/.test(normalized)) {
    return "trust";
  }
  if (/solution|product|demo|解决|产品|方案/.test(normalized)) {
    return "solution";
  }
  if (/pain|problem|risk|痛点|问题|风险/.test(normalized)) {
    return "pain";
  }
  if (/hook|stop|opening|开场|钩子|停/.test(normalized)) {
    return "stop";
  }

  const progress = index / Math.max(total - 1, 1);
  if (progress >= 0.82) {
    return "buy";
  }
  if (progress >= 0.58) {
    return "trust";
  }
  if (progress >= 0.32) {
    return "solution";
  }
  return index === 0 ? "stop" : "pain";
}

function getVideoModel(modelId: string): VideoModelCapabilityWire {
  const model = VIDEO_MODEL_CAPABILITIES.find((item) => item.id === modelId);
  if (!model) {
    throw new RouteError(`Video model was not found: ${modelId}`, {
      status: 400,
      code: "video_model_not_found",
    });
  }

  return model;
}

function getInputModeCapability(
  model: VideoModelCapabilityWire,
  inputMode: VideoInputMode
): VideoModelInputModeWire {
  const capability = model.supported_input_modes.find((item) => item.mode === inputMode);
  if (!capability) {
    throw new RouteError(`${model.name} does not support this input mode.`, {
      status: 400,
      code: "video_input_mode_unsupported",
    });
  }

  return capability;
}

function parseInteger(value: unknown, fieldName: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new RouteError(`${fieldName} must be a number.`, {
      status: 400,
      code: "video_number_invalid",
    });
  }

  return Math.round(parsed);
}

function parseBoundedFloat(value: unknown, capability: VideoModelParameterWire): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new RouteError(`${capability.label} must be a number.`, {
      status: 400,
      code: "video_number_invalid",
    });
  }

  if (typeof capability.min === "number" && parsed < capability.min) {
    throw new RouteError(`${capability.label} cannot be less than ${capability.min}.`, {
      status: 400,
      code: "video_number_out_of_range",
    });
  }

  if (typeof capability.max === "number" && parsed > capability.max) {
    throw new RouteError(`${capability.label} cannot be greater than ${capability.max}.`, {
      status: 400,
      code: "video_number_out_of_range",
    });
  }

  return parsed;
}

function normalizeTaskId(taskId: string): string {
  const normalized = taskId.trim();
  if (!/^video-task-[a-zA-Z0-9-]+$/.test(normalized)) {
    throw new RouteError("Invalid video task id.", {
      status: 400,
      code: "video_task_id_invalid",
    });
  }

  return normalized;
}

function resolveOutputPath(outputRoot: string, pathSegments: string[]): string {
  const safePath = path.resolve(/*turbopackIgnore: true*/ outputRoot, ...pathSegments);
  const normalizedRoot = path.resolve(/*turbopackIgnore: true*/ outputRoot);

  if (safePath !== normalizedRoot && !safePath.startsWith(`${normalizedRoot}${path.sep}`)) {
    throw new RouteError("Invalid output path.", {
      status: 400,
      code: "video_output_path_invalid",
    });
  }

  return safePath;
}

function buildOutputUrl(request: Request, relativePath: string): string {
  const origin = new URL(request.url).origin;
  const encodedPath = relativePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `${origin}${OUTPUT_API_PREFIX}${encodedPath}`;
}

function toOutputRelativePath(outputRoot: string, targetPath: string): string {
  return path.relative(outputRoot, targetPath).split(path.sep).join("/");
}

function buildFrameTimestamps(
  durationSeconds: number,
  intervalSeconds: number,
  maxFrames: number
): number[] {
  if (!durationSeconds || durationSeconds <= 0) {
    return [0];
  }

  const timestamps: number[] = [];
  for (
    let timestamp = 0;
    timestamp <= durationSeconds && timestamps.length < maxFrames;
    timestamp += intervalSeconds
  ) {
    timestamps.push(roundNumber(timestamp, 2));
  }

  if (timestamps.length === 0) {
    timestamps.push(0);
  }

  return timestamps;
}

function sampleFrames(frames: ManifestFrame[], limit: number): ManifestFrame[] {
  if (frames.length <= limit) {
    return frames;
  }

  const lastIndex = frames.length - 1;
  const selectedIndexes = new Set(
    Array.from({ length: limit }, (_, index) =>
      Math.round((index * lastIndex) / Math.max(limit - 1, 1))
    )
  );

  return frames.filter((_, index) => selectedIndexes.has(index));
}

function parseFrameRate(value: unknown): number {
  const text = normalizeStringValue(value, { allowEmpty: true });
  if (!text) {
    return 0;
  }

  const [numeratorText, denominatorText] = text.split("/");
  const numerator = Number(numeratorText);
  const denominator = Number(denominatorText ?? 1);

  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return 0;
  }

  return roundNumber(numerator / denominator, 2);
}

function getFfmpegBinary(): string | null {
  return typeof ffmpegStatic === "string" && ffmpegStatic ? ffmpegStatic : "ffmpeg";
}

function getFfprobeBinary(): string | null {
  const candidate = ffprobeStatic as { path?: unknown } | string | null;

  if (typeof candidate === "string" && candidate) {
    return candidate;
  }

  if (
    candidate &&
    typeof candidate === "object" &&
    typeof candidate.path === "string" &&
    candidate.path
  ) {
    return candidate.path;
  }

  return "ffprobe";
}

function buildOpenAiAudioTranscriptionUrl(): string {
  const baseURL = (process.env.OPENAI_BASE_URL || "https://api.openai.com")
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/v1$/i, "");

  return `${baseURL}/v1/audio/transcriptions`;
}

function safeFileName(source: string, fallback: string): string {
  const parsed = path.parse(source || fallback);
  const stem = parsed.name || path.parse(fallback).name;
  const extension = parsed.ext || path.parse(fallback).ext || ".bin";
  const safeStem = stem
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return `${safeStem || "file"}${extension.toLowerCase()}`;
}

function safeSlug(source: string): string {
  return (
    source
      .normalize("NFKD")
      .replace(/[^\w.-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 80) || "video"
  );
}

function createTimestamp(): string {
  return new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
}

function isoNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function roundNumber(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function trimText(text: string, limit: number): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= limit) {
    return compact;
  }

  return `${compact.slice(0, limit - 1)}...`;
}

function formatOptionalFailure(label: string, error: unknown): string {
  if (error instanceof RouteError) {
    logRouteError("video-studio", error);
    return `${label}: ${error.message}`;
  }

  return `${label}: ${error instanceof Error ? error.message : "unknown error"}`;
}

function parseJson(value: string): unknown {
  if (!value.trim()) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractErrorMessage(value: unknown): string {
  if (!isRecord(value)) {
    return "";
  }

  if (typeof value.error === "string") {
    return value.error;
  }

  if (isRecord(value.error)) {
    return normalizeStringValue(value.error.message, { allowEmpty: true });
  }

  return normalizeStringValue(value.message, { allowEmpty: true });
}

function contentTypeForPath(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".mov":
      return "video/quicktime";
    case ".webm":
      return "video/webm";
    case ".mp4":
      return "video/mp4";
    default:
      return "application/octet-stream";
  }
}
