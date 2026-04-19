"use client";

import { useTransition } from "react";
import {
  normalizeApiRequestError,
  parseApiRequestError,
} from "@/components/AiRequestErrorAlert";
import { DiagnosticsForm } from "@/components/listing-diagnostics/diagnostics-form";
import { DiagnosticsResults } from "@/components/listing-diagnostics/diagnostics-results";
import { useListingDiagnosticsStore } from "@/lib/listing-diagnostics/store";
import type { ListingDiagnosticsApiResponse } from "@/lib/listing-diagnostics/types";

const ASIN_PATTERN = /^[A-Z0-9]{10}$/;
type SpApiRuntimeField = "clientId" | "clientSecret" | "refreshToken" | "sellerId";

export function DiagnosticsWorkbench() {
  const [isPending, startTransition] = useTransition();
  const {
    targetAsin,
    competitorAsins,
    marketplace,
    spApiConfig,
    status,
    result,
    errorMessage,
    errorCode,
    setTargetAsin,
    setMarketplace,
    setCompetitorAsin,
    setSpApiMode,
    updateSpApiRuntime,
    resetSpApiRuntime,
    addCompetitorSlot,
    removeCompetitorSlot,
    startAnalysis,
    finishAnalysis,
    failAnalysis,
    clearError,
    reset,
  } = useListingDiagnosticsStore();

  const isSubmitting = status === "loading" || isPending;

  async function submitAnalysis(): Promise<void> {
    const normalizedTargetAsin = targetAsin.trim().toUpperCase();

    if (!ASIN_PATTERN.test(normalizedTargetAsin)) {
      failAnalysis("Target ASIN must be a valid 10-character ASIN.", "targetAsin_invalid");
      return;
    }

    const normalizedCompetitorAsins = competitorAsins
      .map((asin) => asin.trim().toUpperCase())
      .filter(Boolean);
    const invalidCompetitorAsins = normalizedCompetitorAsins.filter(
      (asin) => !ASIN_PATTERN.test(asin)
    );

    if (invalidCompetitorAsins.length > 0) {
      failAnalysis(
        `Competitor ASINs must be valid 10-character ASINs. Invalid values: ${invalidCompetitorAsins.join(", ")}.`,
        "competitor_asins_invalid"
      );
      return;
    }

    if (normalizedCompetitorAsins.some((asin) => asin === normalizedTargetAsin)) {
      failAnalysis(
        "Competitor ASINs cannot include the target ASIN.",
        "competitor_asins_duplicate_target"
      );
      return;
    }

    const duplicateCompetitorAsins = normalizedCompetitorAsins.filter(
      (asin, index) => normalizedCompetitorAsins.indexOf(asin) !== index
    );

    if (duplicateCompetitorAsins.length > 0) {
      failAnalysis(
        `Competitor ASINs must be unique. Duplicate values: ${Array.from(new Set(duplicateCompetitorAsins)).join(", ")}.`,
        "competitor_asins_duplicate"
      );
      return;
    }

    if (spApiConfig.mode === "runtime") {
      const runtimeEntries = Object.entries(spApiConfig.runtime) as Array<
        [keyof typeof spApiConfig.runtime, string]
      >;
      const missingFields = runtimeEntries
        .filter(([, value]) => value.trim().length === 0)
        .map(([key]) => key);

      if (missingFields.length > 0) {
        failAnalysis(
          `SP-API runtime mode requires ${missingFields.map(formatSpApiFieldLabel).join(", ")}.`,
          "sp_api_runtime_incomplete"
        );
        return;
      }
    }

    const payload = {
      targetAsin: normalizedTargetAsin,
      competitorAsins: normalizedCompetitorAsins,
      marketplace,
      spApi: spApiConfig,
    };

    startAnalysis();

    try {
      const response = await fetch("/api/listing-diagnostics/analyze", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw await parseApiRequestError(response, "Listing diagnosis failed.");
      }

      const parsed = (await response.json()) as ListingDiagnosticsApiResponse;

      startTransition(() => {
        finishAnalysis(parsed);
      });
    } catch (error) {
      const normalizedError = normalizeApiRequestError(
        error,
        "Listing diagnosis failed."
      );

      startTransition(() => {
        failAnalysis(normalizedError.message, normalizedError.code);
      });
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitAnalysis();
  }

  return (
    <section className="page-shell mt-8 space-y-6 pb-12">
      <DiagnosticsForm
        targetAsin={targetAsin}
        marketplace={marketplace}
        competitorAsins={competitorAsins}
        spApiConfig={spApiConfig}
        isSubmitting={isSubmitting}
        onTargetAsinChange={setTargetAsin}
        onMarketplaceChange={setMarketplace}
        onCompetitorAsinChange={setCompetitorAsin}
        onSpApiModeChange={setSpApiMode}
        onSpApiRuntimeChange={updateSpApiRuntime}
        onSpApiReset={resetSpApiRuntime}
        onAddCompetitor={addCompetitorSlot}
        onRemoveCompetitor={removeCompetitorSlot}
        onReset={reset}
        onSubmit={handleSubmit}
      />

      <DiagnosticsResults
        status={status}
        result={result}
        errorMessage={errorMessage}
        errorCode={errorCode}
        onRetry={() => {
          void submitAnalysis();
        }}
        onClearError={clearError}
      />
    </section>
  );
}

function formatSpApiFieldLabel(field: SpApiRuntimeField): string {
  switch (field) {
    case "clientId":
      return "LWA client ID";
    case "clientSecret":
      return "LWA client secret";
    case "refreshToken":
      return "refresh token";
    case "sellerId":
      return "seller ID";
  }
}
