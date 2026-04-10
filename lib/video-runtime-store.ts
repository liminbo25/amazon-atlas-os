import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { AiRuntimeServiceConfig } from "./types";

export type VideoRuntimeServiceKey = "frameAnalysis" | "copyGeneration";

export interface VideoRuntimeSettings {
  frameAnalysis: AiRuntimeServiceConfig;
  copyGeneration: AiRuntimeServiceConfig;
}

interface VideoRuntimeStore {
  aiRuntimeSettings: VideoRuntimeSettings;
  updateAiRuntimeSettings: (
    service: VideoRuntimeServiceKey,
    patch: Partial<AiRuntimeServiceConfig>
  ) => void;
  resetAiRuntimeSettings: () => void;
}

export const DEFAULT_VIDEO_RUNTIME_SETTINGS: VideoRuntimeSettings = {
  frameAnalysis: {
    provider: "",
    baseUrl: "",
    model: "",
    apiKey: "",
  },
  copyGeneration: {
    provider: "",
    baseUrl: "",
    model: "",
    apiKey: "",
  },
};

export const useVideoRuntimeStore = create<VideoRuntimeStore>()(
  persist(
    (set) => ({
      aiRuntimeSettings: DEFAULT_VIDEO_RUNTIME_SETTINGS,
      updateAiRuntimeSettings: (service, patch) =>
        set((state) => ({
          aiRuntimeSettings: {
            ...state.aiRuntimeSettings,
            [service]: {
              ...state.aiRuntimeSettings[service],
              ...patch,
            },
          },
        })),
      resetAiRuntimeSettings: () =>
        set({
          aiRuntimeSettings: DEFAULT_VIDEO_RUNTIME_SETTINGS,
        }),
    }),
    {
      name: "video-studio-runtime-settings",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
