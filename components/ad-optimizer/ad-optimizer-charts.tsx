"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AdOptimizerAnalysisResult } from "@/lib/ad-optimizer/types";

const pieColors = ["#102033", "#0B7785", "#F6B63F"];

export function AdOptimizerCharts({
  result,
}: {
  result: AdOptimizerAnalysisResult;
}) {
  const recommendationData = result.recommendationSummary.map((item) => ({
    name: item.label,
    ready: item.readyCount,
    review: item.reviewCount,
  }));

  const coverageData = result.mappingCoverage
    ? [
        {
          name: "Campaign",
          value: Number((result.mappingCoverage.campaignCoverage * 100).toFixed(1)),
        },
        {
          name: "Ad Group",
          value: Number((result.mappingCoverage.adGroupCoverage * 100).toFixed(1)),
        },
        {
          name: "Target",
          value: Number((result.mappingCoverage.targetCoverage * 100).toFixed(1)),
        },
      ]
    : [];

  return (
    <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
      <article className="rounded-[1.7rem] border border-slate-200 bg-white p-5">
        <p className="section-kicker">动作分布</p>
        <h3 className="mt-3 text-xl font-semibold text-slate-950">
          建议动作的可执行度分层
        </h3>
        <div className="mt-5 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={recommendationData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="name" tick={{ fill: "#475569", fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fill: "#475569", fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="ready" stackId="a" fill="#102033" radius={[8, 8, 0, 0]} />
              <Bar dataKey="review" stackId="a" fill="#F6B63F" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </article>

      <article className="rounded-[1.7rem] border border-slate-200 bg-white p-5">
        <p className="section-kicker">映射覆盖</p>
        <h3 className="mt-3 text-xl font-semibold text-slate-950">
          bulk 身份补齐覆盖率
        </h3>
        <div className="mt-5 h-72">
          {coverageData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={coverageData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={4}
                >
                  {coverageData.map((entry, index) => (
                    <Cell
                      key={entry.name}
                      fill={pieColors[index % pieColors.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) =>
                    `${typeof value === "number" ? value : Number(value ?? 0)}%`
                  }
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center rounded-[1.3rem] border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
              上传 bulk 身份表后会显示 coverage。
            </div>
          )}
        </div>
        {coverageData.length > 0 ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {coverageData.map((item, index) => (
              <div
                key={item.name}
                className="rounded-[1.2rem] bg-slate-50 px-4 py-3"
              >
                <div
                  className="h-2 w-12 rounded-full"
                  style={{ backgroundColor: pieColors[index % pieColors.length] }}
                />
                <p className="mt-3 text-sm font-semibold text-slate-950">
                  {item.name}
                </p>
                <p className="mt-1 text-sm text-slate-500">{item.value}%</p>
              </div>
            ))}
          </div>
        ) : null}
      </article>
    </div>
  );
}
