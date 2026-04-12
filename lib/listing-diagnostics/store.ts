"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type {
  ListingDiagnosticsApiResponse,
  ListingDiagnosticsStore,
} from "@/lib/listing-diagnostics/types";

const initialState = {
  targetAsin: "",
  competitorAsins: ["", "", ""],
  marketplace: "US",
  status: "idle",
  result: null,
  errorMessage: null,
  errorCode: null,
} satisfies Omit<
  ListingDiagnosticsStore,
  | "setTargetAsin"
  | "setMarketplace"
  | "setCompetitorAsin"
  | "addCompetitorSlot"
  | "removeCompetitorSlot"
  | "startAnalysis"
  | "finishAnalysis"
  | "failAnalysis"
  | "clearError"
  | "reset"
>;

export const useListingDiagnosticsStore = create<ListingDiagnosticsStore>()(
  persist(
    (set) => ({
      ...initialState,
      setTargetAsin: (asin) =>
        set({
          targetAsin: asin.toUpperCase(),
        }),
      setMarketplace: (marketplace) =>
        set({
          marketplace,
        }),
      setCompetitorAsin: (index, asin) =>
        set((state) => ({
          competitorAsins: state.competitorAsins.map((value, valueIndex) =>
            valueIndex === index ? asin.toUpperCase() : value
          ),
        })),
      addCompetitorSlot: () =>
        set((state) => ({
          competitorAsins:
            state.competitorAsins.length >= 5
              ? state.competitorAsins
              : [...state.competitorAsins, ""],
        })),
      removeCompetitorSlot: (index) =>
        set((state) => ({
          competitorAsins:
            state.competitorAsins.length <= 1
              ? state.competitorAsins
              : state.competitorAsins.filter((_, valueIndex) => valueIndex !== index),
        })),
      startAnalysis: () =>
        set({
          status: "loading",
          errorMessage: null,
          errorCode: null,
          result: null,
        }),
      finishAnalysis: (response: ListingDiagnosticsApiResponse) =>
        set({
          status: response.status,
          result: response.result,
          errorMessage: null,
          errorCode: null,
        }),
      failAnalysis: (message, code = null) =>
        set({
          status: "error",
          errorMessage: message,
          errorCode: code,
          result: null,
        }),
      clearError: () =>
        set((state) => ({
          errorMessage: null,
          errorCode: null,
          status: state.result ? state.status : "idle",
        })),
      reset: () =>
        set({
          ...initialState,
        }),
    }),
    {
      name: "listing-diagnostics-store",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        targetAsin: state.targetAsin,
        competitorAsins: state.competitorAsins,
        marketplace: state.marketplace,
        result: state.result,
        status: state.result ? state.status : "idle",
      }),
    }
  )
);
