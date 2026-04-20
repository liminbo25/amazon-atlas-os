"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AdOptimizerAnalysisResult } from "@/lib/ad-optimizer/types";

const palette = {
  primary: "#102033",
  teal: "#0B7785",
  amber: "#F6B63F",
};

export function AdOptimizerCharts({
  result,
}: {
  result: AdOptimizerAnalysisResult;
}) {
  const recommendationData = result.recommendationSummary
    .filter((item) => item.count > 0)
    .map((item) => ({
      name: item.label,
      ready: item.readyCount,
      review: item.reviewCount,
    }));

  const campaignData = result.campaignRows.slice(0, 8).map((item) => ({
    name: shrinkLabel(item.campaignName),
    governance: item.governanceRiskCount,
    placement: item.placementSuggestionCount,
    budget: item.budgetSuggestionCount,
  }));

  return (
    <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
      <article className="obsidian-card p-5">
        <p className="section-kicker">建议分布</p>
        <h3 className="mt-3 text-xl font-semibold text-[#f7f0e6]">
          各类动作的 ready / review 占比
        </h3>
        <MeasuredChartFrame
          hasData={recommendationData.length > 0}
          emptyText="当前没有可展示的建议分布。"
        >
          {(size) => (
            <BarChart width={size.width} height={size.height} data={recommendationData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="name" tick={{ fill: "#475569", fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fill: "#475569", fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="ready" stackId="a" fill={palette.primary} radius={[8, 8, 0, 0]} />
              <Bar dataKey="review" stackId="a" fill={palette.amber} radius={[8, 8, 0, 0]} />
            </BarChart>
          )}
        </MeasuredChartFrame>
      </article>

      <article className="obsidian-card p-5">
        <p className="section-kicker">Campaign 风险面</p>
        <h3 className="mt-3 text-xl font-semibold text-[#f7f0e6]">
          重点 campaign 的治理 / placement / 预算动作数
        </h3>
        <MeasuredChartFrame
          hasData={campaignData.length > 0}
          emptyText="当前没有可展示的 campaign 动作数。"
        >
          {(size) => (
            <BarChart width={size.width} height={size.height} data={campaignData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="name" tick={{ fill: "#475569", fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fill: "#475569", fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="governance" fill={palette.amber} radius={[8, 8, 0, 0]} />
              <Bar dataKey="placement" fill={palette.teal} radius={[8, 8, 0, 0]} />
              <Bar dataKey="budget" fill={palette.primary} radius={[8, 8, 0, 0]} />
            </BarChart>
          )}
        </MeasuredChartFrame>
      </article>
    </div>
  );
}

function EmptyChart({ text }: { text: string }) {
  return (
    <div className="obsidian-empty-state flex h-full items-center justify-center px-4 text-center text-sm">
      {text}
    </div>
  );
}

function MeasuredChartFrame({
  hasData,
  emptyText,
  children,
}: {
  hasData: boolean;
  emptyText: string;
  children: (size: { width: number; height: number }) => ReactNode;
}) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = frameRef.current;
    if (!element || typeof ResizeObserver === "undefined") {
      return;
    }

    const updateSize = () => {
      const nextWidth = Math.max(Math.floor(element.clientWidth), 0);
      const nextHeight = Math.max(Math.floor(element.clientHeight), 0);
      setSize((current) =>
        current.width === nextWidth && current.height === nextHeight
          ? current
          : { width: nextWidth, height: nextHeight }
      );
    };

    updateSize();
    const observer = new ResizeObserver(() => updateSize());
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={frameRef} className="mt-5 h-80">
      {hasData && size.width > 40 && size.height > 40 ? (
        children(size)
      ) : (
        <EmptyChart text={emptyText} />
      )}
    </div>
  );
}

function shrinkLabel(value: string) {
  return value.length > 14 ? `${value.slice(0, 14)}...` : value;
}
