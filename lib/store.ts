import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type {
  AiRuntimeSettings,
  ListingStore,
} from "./types";

export const DEFAULT_AI_RUNTIME_SETTINGS: AiRuntimeSettings = {
  imageAnalysis: {
    provider: "",
    baseUrl: "",
    model: "",
    apiKey: "",
  },
  vocAnalysis: {
    provider: "",
    baseUrl: "",
    model: "",
    apiKey: "",
  },
  listingGeneration: {
    provider: "",
    baseUrl: "",
    model: "",
    apiKey: "",
  },
};

const initialState = {
  currentStep: 1,
  aiRuntimeSettings: DEFAULT_AI_RUNTIME_SETTINGS,
  productProfile: {
    brandName: "",
    productName: "",
    productCategory: "",
    productDescription: "",
    coreKeywords: "",
  },
  targetMarket: "US",
  competitorAsins: ["", "", ""],
  coreSellingPoints: "",
  productImages: [] as import("./types").ProductImage[],
  visionAnalysis: null as import("./types").VisionAnalysisResult | null,
  supportAssets: {
    abaReport: null as import("./types").AbaReportFile | null,
    rufusScreenshots: [] as import("./types").RufusScreenshot[],
  },
  competitorListings: [],
  competitorReviews: {},
  positiveReviews: {},
  trafficKeywords: {},
  dataAnalysis: null as import("./types").DataAnalysisResult | null,
  painPoints: [],
  valuePoints: [],
  competitorAnalysis: [],
  listingVersions: [],
  complianceResults: {},
  isLoading: false,
};

export const useListingStore = create<ListingStore>()(
  persist(
    (set, get) => ({
      ...initialState,
      setCurrentStep: (step) => set({ currentStep: step }),
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
          aiRuntimeSettings: DEFAULT_AI_RUNTIME_SETTINGS,
        }),
      updateProductProfile: (patch) =>
        set((state) => ({
          productProfile: {
            ...state.productProfile,
            ...patch,
          },
        })),
      setTargetMarket: (market) => set({ targetMarket: market }),
      setCompetitorAsins: (asins) => set({ competitorAsins: asins }),
      setCoreSellingPoints: (points) => set({ coreSellingPoints: points }),
      setProductImages: (images) => set({ productImages: images }),
      setVisionAnalysis: (analysis) => set({ visionAnalysis: analysis }),
      setSupportAssets: (patch) =>
        set((state) => ({
          supportAssets: {
            ...state.supportAssets,
            ...patch,
          },
        })),
      setCompetitorListings: (listings) => set({ competitorListings: listings }),
      setCompetitorReviews: (reviews) => set({ competitorReviews: reviews }),
      setPositiveReviews: (reviews) => set({ positiveReviews: reviews }),
      setTrafficKeywords: (keywords) => set({ trafficKeywords: keywords }),
      setDataAnalysis: (result) => set({ dataAnalysis: result }),
      setPainPoints: (points) => set({ painPoints: points }),
      setValuePoints: (points) => set({ valuePoints: points }),
      setCompetitorAnalysis: (analysis) => set({ competitorAnalysis: analysis }),
      setListingVersions: (versions) => set({ listingVersions: versions }),
      setComplianceResults: (results) => set({ complianceResults: results }),
      setIsLoading: (loading) => set({ isLoading: loading }),
      reset: () =>
        set({
          ...initialState,
          aiRuntimeSettings: get().aiRuntimeSettings,
        }),
    }),
    {
      name: "listing-module-runtime-settings",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        aiRuntimeSettings: state.aiRuntimeSettings,
      }),
    }
  )
);
