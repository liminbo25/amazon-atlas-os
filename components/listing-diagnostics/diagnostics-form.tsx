"use client";

import { Plus, Search, X } from "lucide-react";
import { SpApiRuntimePanel } from "@/components/listing-diagnostics/sp-api-runtime-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  ListingDiagnosticsSpApiConfig,
  ListingDiagnosticsSpApiMode,
  ListingDiagnosticsSpApiRuntimeCredentials,
} from "@/lib/listing-diagnostics/types";

const MARKETPLACE_OPTIONS = ["US", "CA", "UK", "DE", "FR", "IT", "ES", "JP"];

interface DiagnosticsFormProps {
  targetAsin: string;
  marketplace: string;
  competitorAsins: string[];
  spApiConfig: ListingDiagnosticsSpApiConfig;
  isSubmitting: boolean;
  onTargetAsinChange: (value: string) => void;
  onMarketplaceChange: (value: string) => void;
  onCompetitorAsinChange: (index: number, value: string) => void;
  onSpApiModeChange: (value: ListingDiagnosticsSpApiMode) => void;
  onSpApiRuntimeChange: (
    patch: Partial<ListingDiagnosticsSpApiRuntimeCredentials>
  ) => void;
  onSpApiReset: () => void;
  onAddCompetitor: () => void;
  onRemoveCompetitor: (index: number) => void;
  onReset: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}

export function DiagnosticsForm({
  targetAsin,
  marketplace,
  competitorAsins,
  spApiConfig,
  isSubmitting,
  onTargetAsinChange,
  onMarketplaceChange,
  onCompetitorAsinChange,
  onSpApiModeChange,
  onSpApiRuntimeChange,
  onSpApiReset,
  onAddCompetitor,
  onRemoveCompetitor,
  onReset,
  onSubmit,
}: DiagnosticsFormProps) {
  return (
    <Card className="obsidian-workbench">
      <form onSubmit={onSubmit}>
        <CardHeader className="border-b border-white/10">
          <CardTitle className="flex items-center gap-3 text-xl text-[#f7f0e6]">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[rgba(246,182,63,0.24)] bg-[rgba(246,182,63,0.14)] text-[#f6c26a]">
              <Search className="h-4 w-4" />
            </span>
            Listing Diagnostics Workbench
          </CardTitle>
          <p className="text-sm leading-7 text-[#c5b9aa]">
            SellerSprite stays on the deterministic primary path. Optional SP-API
            verification upgrades BUYABLE and DISCOVERABLE blockers into
            verified operator-grade root causes without breaking the fallback
            scoring flow.
          </p>
        </CardHeader>

        <CardContent className="space-y-6 pt-6">
          <div className="obsidian-filter-bar grid gap-4 p-4 lg:grid-cols-[1fr_180px]">
            <div className="space-y-2">
              <Label htmlFor="target-asin" className="text-[#dfd2c3]">
                Target ASIN
              </Label>
              <Input
                id="target-asin"
                placeholder="B0XXXXXXXX"
                value={targetAsin}
                onChange={(event) => onTargetAsinChange(event.target.value)}
                disabled={isSubmitting}
                maxLength={10}
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="marketplace" className="text-[#dfd2c3]">
                Marketplace
              </Label>
              <Select
                value={marketplace}
                onValueChange={(value) => {
                  if (value) {
                    onMarketplaceChange(value);
                  }
                }}
              >
                <SelectTrigger id="marketplace" className="h-10 w-full">
                  <SelectValue placeholder="Select marketplace" />
                </SelectTrigger>
                <SelectContent>
                  {MARKETPLACE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="obsidian-soft-card space-y-4 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label className="text-[#dfd2c3]">Competitor ASINs</Label>
                <p className="mt-1 text-sm text-[#998e82]">
                  Optional, but 2-3 ASINs give the benchmark and keyword proxy layers more
                  confidence.
                </p>
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={onAddCompetitor}
                disabled={isSubmitting || competitorAsins.length >= 5}
              >
                <Plus />
                Add ASIN
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {competitorAsins.map((asin, index) => (
                <div
                  key={`competitor-${index}`}
                  className="obsidian-soft-card p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <Label
                      htmlFor={`competitor-asin-${index}`}
                      className="text-[#dfd2c3]"
                    >
                      Competitor {index + 1}
                    </Label>
                    {competitorAsins.length > 1 ? (
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="ghost"
                        onClick={() => onRemoveCompetitor(index)}
                        disabled={isSubmitting}
                      >
                        <X />
                      </Button>
                    ) : null}
                  </div>
                  <Input
                    id={`competitor-asin-${index}`}
                    placeholder="B0XXXXXXXX"
                    value={asin}
                    onChange={(event) =>
                      onCompetitorAsinChange(index, event.target.value)
                    }
                    disabled={isSubmitting}
                    maxLength={10}
                    className="mt-3 h-11"
                  />
                </div>
              ))}
            </div>
          </div>

          <SpApiRuntimePanel
            targetAsin={targetAsin}
            marketplace={marketplace}
            config={spApiConfig}
            disabled={isSubmitting}
            onModeChange={onSpApiModeChange}
            onRuntimeChange={onSpApiRuntimeChange}
            onReset={onSpApiReset}
          />

          <div className="obsidian-inline-note p-4">
            <p className="text-sm font-semibold text-[#f3dfb6]">Phase 1 scope</p>
            <p className="mt-2 text-sm leading-7 text-[#dfd2c3]">
              SellerSprite remains the primary analysis path. When SP-API verification is
              enabled, the result can verify catalog and seller-account blockers,
              classify likely root causes, and rank the next operator actions
              without changing the fallback behavior.
            </p>
          </div>
        </CardContent>

        <CardFooter className="justify-between gap-3 border-t border-white/10 bg-[rgba(255,255,255,0.03)]">
          <Button
            type="button"
            variant="outline"
            onClick={onReset}
            disabled={isSubmitting}
          >
            Reset
          </Button>
          <Button type="submit" size="lg" disabled={isSubmitting}>
            {isSubmitting ? "Running diagnosis..." : "Analyze listing"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
