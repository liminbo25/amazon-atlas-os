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
            SellerSprite 负责基础 Listing、评论和关键词信号，Amazon SP-API
            负责把可售性与目录阻塞项升级成已验证问题。最终输出不是一串英文 findings，
            而是一份能直接执行的中文运营诊断。
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
                  建议至少提供 2-3 个竞品 ASIN，这样关键词竞争、优缺点对比和优化方案会更稳。
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
            <p className="text-sm font-semibold text-slate-900">当前交付范围</p>
            <p className="mt-2 text-sm leading-7 text-slate-600">
              本模块会把 SellerSprite 的 Listing、评论、关键词信号重组为中文运营报告；
              如果启用 SP-API，还会把目录和可售性阻塞项单独升级成 Amazon 已验证问题。
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
            {isSubmitting ? "正在生成诊断..." : "开始分析"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
