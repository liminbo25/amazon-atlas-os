export type VideoInputMode =
  | "text_to_video"
  | "image_to_video"
  | "frame_to_video"
  | "multi_image_to_video";

export type VideoModelParameterKey =
  | "negative_prompt"
  | "seed"
  | "motion_strength"
  | "camera_strength"
  | "style_strength";

export type VideoModelAssetSlot = {
  id: string;
  label: string;
  description: string;
  accept: string;
  multiple: boolean;
  optional: boolean;
  minFiles: number;
  maxFiles: number;
};

export type VideoModelParameter = {
  key: VideoModelParameterKey;
  label: string;
  description: string;
  kind: "textarea" | "number" | "range";
  min?: number;
  max?: number;
  step?: number;
  defaultValue?: number | string;
};

export type VideoModelCapability = {
  id: string;
  name: string;
  provider: string;
  description: string;
  integrationStatus: "planned" | "connected";
  statusLabel: string;
  statusDetail: string;
  supportedInputModes: Array<{
    mode: VideoInputMode;
    label: string;
    description: string;
    assetSlots: VideoModelAssetSlot[];
  }>;
  supportedAspectRatios: string[];
  duration: {
    minSeconds: number;
    maxSeconds: number;
    stepSeconds: number;
    defaultSeconds: number;
  };
  qualities: Array<{
    id: string;
    label: string;
    description: string;
  }>;
  supportedParameters: VideoModelParameter[];
  notes: string[];
};

export type VideoGenerationDraft = {
  modelId: string;
  inputMode: VideoInputMode;
  prompt: string;
  negativePrompt: string;
  aspectRatio: string;
  durationSeconds: number;
  quality: string;
  seed: string;
  motionStrength: number | null;
  cameraStrength: number | null;
  styleStrength: number | null;
};

export type VideoGenerationTask = {
  taskId: string;
  modelId: string;
  modelName: string;
  provider: string;
  inputMode: VideoInputMode;
  integrationStatus: "planned" | "connected";
  status: string;
  statusLabel: string;
  statusDetail: string;
  createdAt: string;
  updatedAt: string;
  prompt: string;
  negativePrompt?: string;
  parameters: Record<string, unknown>;
  assets: Array<{
    slotId: string;
    label: string;
    name: string;
    sizeBytes?: number;
    url?: string;
  }>;
  result: {
    videos: Array<{
      label: string;
      url?: string;
      note?: string;
    }>;
    placeholderMessage?: string;
    nextStep?: string;
  };
};

export type VideoManifest = {
  jobId?: string;
  video: string;
  durationSeconds: number;
  frames: Array<{
    index: number;
    timestampSeconds: number;
    file?: string;
    src?: string;
    note?: string;
  }>;
  transcriptText: string;
  structureBlocks: Array<{
    id: string;
    stage: string;
    stageLabel: string;
    title: string;
    summary: string;
    recommendation: string;
    transcript: string;
    startSeconds: number;
    endSeconds: number;
    confidence: number;
    tags: string[];
  }>;
  visualAnalysis?: {
    summary?: string;
    hookStrategy?: string;
    productPresence?: string;
    proofSignals?: string;
  };
  analysisNotes: string[];
};

export type CopyPlan = {
  summary: string;
  prompt: string;
  scriptAngles: Array<{
    id: string;
    name: string;
    positioning: string;
    tone: string;
    hook: string;
    bridge: string;
    proof: string;
    cta: string;
    tags: string[];
  }>;
  scriptDrafts: Array<{
    id: string;
    angleName: string;
    positioning: string;
    tone: string;
    headline: string;
    summary: string;
    fullScript: string;
    caption: string;
    stageLines: Array<{
      stage: string;
      label: string;
      line: string;
    }>;
  }>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function normalizeText(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function normalizeNumber(value: unknown, fallback = 0) {
  return typeof value === "number"
    ? value
    : typeof value === "string" && value.trim()
      ? Number(value) || fallback
      : fallback;
}

function normalizeAssetSlot(value: unknown): VideoModelAssetSlot | null {
  const source = asRecord(value);
  if (!source) {
    return null;
  }

  const id = normalizeText(source.id).trim();
  if (!id) {
    return null;
  }

  return {
    id,
    label: normalizeText(source.label, id),
    description: normalizeText(source.description),
    accept: normalizeText(source.accept, "image/*"),
    multiple: Boolean(source.multiple),
    optional: Boolean(source.optional),
    minFiles: normalizeNumber(source.min_files ?? source.minFiles, 1),
    maxFiles: normalizeNumber(source.max_files ?? source.maxFiles, 1),
  };
}

function normalizeParameter(value: unknown): VideoModelParameter | null {
  const source = asRecord(value);
  if (!source) {
    return null;
  }

  const key = source.key;
  if (
    key !== "negative_prompt" &&
    key !== "seed" &&
    key !== "motion_strength" &&
    key !== "camera_strength" &&
    key !== "style_strength"
  ) {
    return null;
  }

  const kind =
    source.kind === "textarea" ||
    source.kind === "number" ||
    source.kind === "range"
      ? source.kind
      : key === "negative_prompt"
        ? "textarea"
        : key === "seed"
          ? "number"
          : "range";

  return {
    key,
    label: normalizeText(source.label, key),
    description: normalizeText(source.description),
    kind,
    min: typeof source.min === "number" ? source.min : undefined,
    max: typeof source.max === "number" ? source.max : undefined,
    step: typeof source.step === "number" ? source.step : undefined,
    defaultValue:
      typeof source.default_value === "number" ||
      typeof source.default_value === "string"
        ? source.default_value
        : typeof source.defaultValue === "number" ||
            typeof source.defaultValue === "string"
          ? source.defaultValue
          : undefined,
  };
}

function normalizeModel(value: unknown): VideoModelCapability | null {
  const source = asRecord(value);
  if (!source) {
    return null;
  }

  const id = normalizeText(source.id).trim();
  if (!id) {
    return null;
  }

  const supportedInputModes = Array.isArray(
    source.supported_input_modes ?? source.supportedInputModes,
  )
    ? (source.supported_input_modes ??
        source.supportedInputModes) as unknown[]
    : [];
  const duration = asRecord(source.duration);

  return {
    id,
    name: normalizeText(source.name, id),
    provider: normalizeText(source.provider, "Unknown"),
    description: normalizeText(source.description),
    integrationStatus: source.integration_status === "connected" ? "connected" : "planned",
    statusLabel: normalizeText(source.status_label ?? source.statusLabel, "待接入"),
    statusDetail: normalizeText(source.status_detail ?? source.statusDetail),
    supportedInputModes: supportedInputModes
      .map((item) => {
        const modeSource = asRecord(item);
        if (!modeSource) {
          return null;
        }

        const mode = modeSource.mode;
        if (
          mode !== "text_to_video" &&
          mode !== "image_to_video" &&
          mode !== "frame_to_video" &&
          mode !== "multi_image_to_video"
        ) {
          return null;
        }

        const assetSlots = Array.isArray(
          modeSource.asset_slots ?? modeSource.assetSlots,
        )
          ? ((modeSource.asset_slots ??
              modeSource.assetSlots) as unknown[])
              .map((slot) => normalizeAssetSlot(slot))
              .filter((slot): slot is VideoModelAssetSlot => Boolean(slot))
          : [];

        return {
          mode,
          label: normalizeText(modeSource.label, mode),
          description: normalizeText(modeSource.description),
          assetSlots,
        };
      })
      .filter(
        (
          item,
        ): item is VideoModelCapability["supportedInputModes"][number] =>
          Boolean(item),
      ),
    supportedAspectRatios: Array.isArray(
      source.supported_aspect_ratios ?? source.supportedAspectRatios,
    )
      ? ((source.supported_aspect_ratios ??
          source.supportedAspectRatios) as unknown[]).filter(
          (item): item is string => typeof item === "string",
        )
      : [],
    duration: {
      minSeconds: normalizeNumber(duration?.min_seconds ?? duration?.minSeconds, 5),
      maxSeconds: normalizeNumber(duration?.max_seconds ?? duration?.maxSeconds, 10),
      stepSeconds: normalizeNumber(duration?.step_seconds ?? duration?.stepSeconds, 5),
      defaultSeconds: normalizeNumber(
        duration?.default_seconds ?? duration?.defaultSeconds,
        5,
      ),
    },
    qualities: Array.isArray(source.qualities)
      ? (source.qualities as unknown[])
          .map((quality) => {
            const qualitySource = asRecord(quality);
            if (!qualitySource) {
              return null;
            }

            const qualityId = normalizeText(qualitySource.id).trim();
            if (!qualityId) {
              return null;
            }

            return {
              id: qualityId,
              label: normalizeText(qualitySource.label, qualityId),
              description: normalizeText(qualitySource.description),
            };
          })
          .filter(
            (
              item,
            ): item is VideoModelCapability["qualities"][number] => Boolean(item),
          )
      : [],
    supportedParameters: Array.isArray(
      source.supported_parameters ?? source.supportedParameters,
    )
      ? ((source.supported_parameters ??
          source.supportedParameters) as unknown[])
          .map((parameter) => normalizeParameter(parameter))
          .filter((parameter): parameter is VideoModelParameter => Boolean(parameter))
      : [],
    notes: Array.isArray(source.notes)
      ? (source.notes as unknown[]).filter((note): note is string => typeof note === "string")
      : [],
  };
}

function defaultNumericParameter(parameter?: VideoModelParameter) {
  if (typeof parameter?.defaultValue === "number") {
    return parameter.defaultValue;
  }

  if (typeof parameter?.min === "number") {
    return parameter.min;
  }

  return null;
}

function supportsParameter(
  model: VideoModelCapability | undefined,
  key: VideoModelParameterKey,
) {
  return model?.supportedParameters.find((parameter) => parameter.key === key);
}

export function normalizeVideoModelListPayload(payload: unknown) {
  const source = asRecord(payload);
  const items = Array.isArray(source?.models)
    ? source.models
    : Array.isArray(payload)
      ? payload
      : [];

  return items
    .map((item) => normalizeModel(item))
    .filter((item): item is VideoModelCapability => Boolean(item));
}

export function createVideoGenerationDraft(model?: VideoModelCapability): VideoGenerationDraft {
  return {
    modelId: model?.id ?? "",
    inputMode: model?.supportedInputModes[0]?.mode ?? "text_to_video",
    prompt: "",
    negativePrompt: "",
    aspectRatio: model?.supportedAspectRatios[0] ?? "16:9",
    durationSeconds: model?.duration.defaultSeconds ?? 5,
    quality: model?.qualities[0]?.id ?? "720p",
    seed: "",
    motionStrength: defaultNumericParameter(supportsParameter(model, "motion_strength")),
    cameraStrength: defaultNumericParameter(supportsParameter(model, "camera_strength")),
    styleStrength: defaultNumericParameter(supportsParameter(model, "style_strength")),
  };
}

export function syncVideoGenerationDraft(
  current: VideoGenerationDraft,
  model?: VideoModelCapability,
): VideoGenerationDraft {
  const next = createVideoGenerationDraft(model);

  return {
    ...next,
    prompt: current.prompt,
    negativePrompt: supportsParameter(model, "negative_prompt")
      ? current.negativePrompt
      : "",
    seed: supportsParameter(model, "seed") ? current.seed : "",
    inputMode: model?.supportedInputModes.some((mode) => mode.mode === current.inputMode)
      ? current.inputMode
      : next.inputMode,
    aspectRatio: model?.supportedAspectRatios.includes(current.aspectRatio)
      ? current.aspectRatio
      : next.aspectRatio,
    durationSeconds:
      current.durationSeconds >= (model?.duration.minSeconds ?? 0) &&
      current.durationSeconds <= (model?.duration.maxSeconds ?? Infinity)
        ? current.durationSeconds
        : next.durationSeconds,
    quality: model?.qualities.some((quality) => quality.id === current.quality)
      ? current.quality
      : next.quality,
    motionStrength: supportsParameter(model, "motion_strength")
      ? current.motionStrength ?? next.motionStrength
      : null,
    cameraStrength: supportsParameter(model, "camera_strength")
      ? current.cameraStrength ?? next.cameraStrength
      : null,
    styleStrength: supportsParameter(model, "style_strength")
      ? current.styleStrength ?? next.styleStrength
      : null,
  };
}

export function buildDurationOptions(model?: VideoModelCapability) {
  if (!model) {
    return [] as number[];
  }

  const items: number[] = [];
  for (
    let current = model.duration.minSeconds;
    current <= model.duration.maxSeconds;
    current += model.duration.stepSeconds
  ) {
    items.push(current);
  }

  return items;
}

export function normalizeVideoTaskPayload(payload: unknown): VideoGenerationTask | null {
  const source = asRecord(payload);
  const task = asRecord(source?.task) ?? source;
  if (!task) {
    return null;
  }

  const taskId = normalizeText(task.task_id ?? task.taskId).trim();
  const inputMode = task.input_mode ?? task.inputMode;
  if (
    !taskId ||
    (inputMode !== "text_to_video" &&
      inputMode !== "image_to_video" &&
      inputMode !== "frame_to_video" &&
      inputMode !== "multi_image_to_video")
  ) {
    return null;
  }

  const result = asRecord(task.result) ?? {};
  const assets = Array.isArray(task.assets)
    ? (task.assets as unknown[]).reduce<VideoGenerationTask["assets"]>(
        (list, item) => {
          const asset = asRecord(item);
          if (!asset) {
            return list;
          }

          const slotId = normalizeText(asset.slot_id ?? asset.slotId).trim();
          const name = normalizeText(asset.name).trim();
          if (!slotId || !name) {
            return list;
          }

          list.push({
            slotId,
            label: normalizeText(asset.label, slotId),
            name,
            sizeBytes:
              typeof asset.size_bytes === "number"
                ? asset.size_bytes
                : typeof asset.sizeBytes === "number"
                  ? asset.sizeBytes
                  : undefined,
            url: normalizeText(asset.url || asset.relative_path) || undefined,
          });

          return list;
        },
        [],
      )
    : [];
  const videos = Array.isArray(result.videos)
    ? (result.videos as unknown[]).reduce<VideoGenerationTask["result"]["videos"]>(
        (list, item) => {
          const video = asRecord(item);
          if (!video) {
            return list;
          }

          const label = normalizeText(video.label).trim();
          if (!label) {
            return list;
          }

          list.push({
            label,
            url: normalizeText(video.url) || undefined,
            note: normalizeText(video.note) || undefined,
          });

          return list;
        },
        [],
      )
    : [];

  return {
    taskId,
    modelId: normalizeText(task.model_id ?? task.modelId),
    modelName: normalizeText(task.model_name ?? task.modelName),
    provider: normalizeText(task.provider),
    inputMode,
    integrationStatus: task.integration_status === "connected" ? "connected" : "planned",
    status: normalizeText(task.status, "waiting_provider"),
    statusLabel: normalizeText(task.status_label ?? task.statusLabel, "任务已创建"),
    statusDetail: normalizeText(task.status_detail ?? task.statusDetail),
    createdAt: normalizeText(task.created_at ?? task.createdAt),
    updatedAt: normalizeText(task.updated_at ?? task.updatedAt),
    prompt: normalizeText(task.prompt),
    negativePrompt: normalizeText(task.negative_prompt ?? task.negativePrompt) || undefined,
    parameters: asRecord(task.parameters) ?? {},
    assets,
    result: {
      videos,
      placeholderMessage:
        normalizeText(result.placeholder_message ?? result.placeholderMessage) || undefined,
      nextStep: normalizeText(result.next_step ?? result.nextStep) || undefined,
    },
  };
}

export function normalizeManifestPayload(payload: unknown): VideoManifest | null {
  const source = asRecord(payload);
  const manifest = asRecord(source?.manifest) ?? source;
  if (!manifest) {
    return null;
  }

  const visual = asRecord(manifest.visual_analysis ?? manifest.visualAnalysis);
  const frames = Array.isArray(manifest.frames)
    ? (manifest.frames as unknown[]).reduce<VideoManifest["frames"]>((list, item) => {
        const frame = asRecord(item);
        if (!frame) {
          return list;
        }

        list.push({
          index: normalizeNumber(frame.index, 0),
          timestampSeconds: normalizeNumber(
            frame.timestamp_seconds ?? frame.timestampSeconds,
            0,
          ),
          file: normalizeText(frame.file) || undefined,
          src: normalizeText(frame.src) || undefined,
          note: normalizeText(frame.note) || undefined,
        });

        return list;
      }, [])
    : [];
  const structureBlocks = Array.isArray(
    manifest.structure_blocks ?? manifest.structureBlocks,
  )
    ? ((manifest.structure_blocks ?? manifest.structureBlocks) as unknown[]).reduce<
        VideoManifest["structureBlocks"]
      >((list, item) => {
        const block = asRecord(item);
        if (!block) {
          return list;
        }

        list.push({
          id: normalizeText(block.id),
          stage: normalizeText(block.stage),
          stageLabel: normalizeText(block.stage_label ?? block.stageLabel),
          title: normalizeText(block.title),
          summary: normalizeText(block.summary),
          recommendation: normalizeText(block.recommendation),
          transcript: normalizeText(block.transcript),
          startSeconds: normalizeNumber(block.start_seconds ?? block.startSeconds, 0),
          endSeconds: normalizeNumber(block.end_seconds ?? block.endSeconds, 0),
          confidence: normalizeNumber(block.confidence, 0),
          tags: Array.isArray(block.tags)
            ? (block.tags as unknown[]).filter(
                (tag): tag is string => typeof tag === "string",
              )
            : [],
        });

        return list;
      }, [])
    : [];

  return {
    jobId: normalizeText(manifest.job_id ?? manifest.jobId) || undefined,
    video: normalizeText(manifest.video),
    durationSeconds: normalizeNumber(
      manifest.duration_seconds ?? manifest.durationSeconds,
      0,
    ),
    frames,
    transcriptText: normalizeText(
      manifest.transcript_text ?? manifest.transcriptText,
    ),
    structureBlocks,
    visualAnalysis: visual
      ? {
          summary: normalizeText(visual.summary),
          hookStrategy: normalizeText(visual.hook_strategy ?? visual.hookStrategy),
          productPresence: normalizeText(
            visual.product_presence ?? visual.productPresence,
          ),
          proofSignals: normalizeText(visual.proof_signals ?? visual.proofSignals),
        }
      : undefined,
    analysisNotes: Array.isArray(manifest.analysis_notes ?? manifest.analysisNotes)
      ? ((manifest.analysis_notes ??
          manifest.analysisNotes) as unknown[]).filter(
          (note): note is string => typeof note === "string",
        )
      : [],
  };
}

export function normalizeCopyPlanPayload(payload: unknown): CopyPlan | null {
  const source = asRecord(payload);
  const plan = asRecord(source?.copy_plan) ?? source;
  if (!plan) {
    return null;
  }

  return {
    summary: normalizeText(plan.summary),
    prompt: normalizeText(plan.prompt),
    scriptAngles: Array.isArray(plan.script_angles ?? plan.scriptAngles)
      ? ((plan.script_angles ?? plan.scriptAngles) as unknown[])
          .map((item) => {
            const angle = asRecord(item);
            if (!angle) {
              return null;
            }

            return {
              id: normalizeText(angle.id),
              name: normalizeText(angle.name),
              positioning: normalizeText(angle.positioning),
              tone: normalizeText(angle.tone),
              hook: normalizeText(angle.hook),
              bridge: normalizeText(angle.bridge),
              proof: normalizeText(angle.proof),
              cta: normalizeText(angle.cta),
              tags: Array.isArray(angle.tags)
                ? (angle.tags as unknown[]).filter(
                    (tag): tag is string => typeof tag === "string",
                  )
                : [],
            };
          })
          .filter((item): item is CopyPlan["scriptAngles"][number] => Boolean(item))
      : [],
    scriptDrafts: Array.isArray(plan.script_drafts ?? plan.scriptDrafts)
      ? ((plan.script_drafts ?? plan.scriptDrafts) as unknown[])
          .map((item) => {
            const draft = asRecord(item);
            if (!draft) {
              return null;
            }

            return {
              id: normalizeText(draft.id),
              angleName: normalizeText(draft.angle_name ?? draft.angleName),
              positioning: normalizeText(draft.positioning),
              tone: normalizeText(draft.tone),
              headline: normalizeText(draft.headline),
              summary: normalizeText(draft.summary),
              fullScript: normalizeText(draft.full_script ?? draft.fullScript),
              caption: normalizeText(draft.caption),
              stageLines: Array.isArray(draft.stage_lines ?? draft.stageLines)
                ? ((draft.stage_lines ?? draft.stageLines) as unknown[])
                    .map((stageLine) => {
                      const line = asRecord(stageLine);
                      if (!line) {
                        return null;
                      }

                      return {
                        stage: normalizeText(line.stage),
                        label: normalizeText(line.label),
                        line: normalizeText(line.line),
                      };
                    })
                    .filter(
                      (
                        item,
                      ): item is CopyPlan["scriptDrafts"][number]["stageLines"][number] =>
                        Boolean(item),
                    )
                : [],
            };
          })
          .filter((item): item is CopyPlan["scriptDrafts"][number] => Boolean(item))
      : [],
  };
}
