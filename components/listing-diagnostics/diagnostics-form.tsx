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
    <Card className="border-slate-200/80 bg-white/85 shadow-[0_16px_50px_rgba(16,32,51,0.06)]">
      <form onSubmit={onSubmit}>
        <CardHeader className="border-b border-slate-200/80">
          <CardTitle className="flex items-center gap-3 text-xl text-slate-950">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white">
              <Search className="h-4 w-4" />
            </span>
            Listing 诊断工作台
          </CardTitle>
          <p className="text-sm leading-7 text-slate-600">
            SellerSprite 保持为确定性的主路径。可选的 SP-API 校验会把 BUYABLE 和
            DISCOVERABLE 阻塞项升级为已验证、可执行的根因，同时不打断兜底评分流程。
          </p>
        </CardHeader>

        <CardContent className="space-y-6 pt-6">
          <div className="grid gap-4 lg:grid-cols-[1fr_180px]">
            <div className="space-y-2">
              <Label htmlFor="target-asin">目标 ASIN</Label>
              <Input
                id="target-asin"
                placeholder="B0XXXXXXXX"
                value={targetAsin}
                onChange={(event) => onTargetAsinChange(event.target.value)}
                disabled={isSubmitting}
                maxLength={10}
                className="h-10"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="marketplace">站点</Label>
              <Select
                value={marketplace}
                onValueChange={(value) => {
                  if (value) {
                    onMarketplaceChange(value);
                  }
                }}
              >
                <SelectTrigger id="marketplace" className="h-10 w-full">
                  <SelectValue placeholder="选择站点" />
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

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label>竞品 ASIN</Label>
                <p className="mt-1 text-sm text-slate-500">
                  可选，但填写 2-3 个 ASIN 能让基准对比和关键词代理层更有把握。
                </p>
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={onAddCompetitor}
                disabled={isSubmitting || competitorAsins.length >= 5}
              >
                <Plus />
                添加 ASIN
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {competitorAsins.map((asin, index) => (
                <div
                  key={`competitor-${index}`}
                  className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor={`competitor-asin-${index}`}>
                      竞品 {index + 1}
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
                    className="mt-3 h-10 bg-white/90"
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

          <div className="rounded-[1.6rem] border border-slate-200 bg-[linear-gradient(135deg,rgba(246,182,63,0.12),rgba(229,237,246,0.5))] p-4">
            <p className="text-sm font-semibold text-slate-900">第一阶段范围</p>
            <p className="mt-2 text-sm leading-7 text-slate-600">
              SellerSprite 仍是主分析路径。启用 SP-API 校验后，结果可以验证目录和卖家账户阻塞项、
              归类更可能的根因，并排序下一步运营动作，同时不改变兜底行为。
            </p>
          </div>
        </CardContent>

        <CardFooter className="justify-between gap-3 border-t border-slate-200/80 bg-slate-50/65">
          <Button
            type="button"
            variant="outline"
            onClick={onReset}
            disabled={isSubmitting}
          >
            重置
          </Button>
          <Button type="submit" size="lg" disabled={isSubmitting}>
            {isSubmitting ? "诊断运行中..." : "分析 Listing"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
