import type {
  AnalysisControls,
  StrategyTemplate,
  StrategyTemplateId,
} from "@/lib/ad-optimizer/types";

export const STRATEGY_TEMPLATES: Record<StrategyTemplateId, StrategyTemplate> = {
  launch: {
    id: "launch",
    label: "新品拉新",
    description: "允许更高的试错成本，优先放量和挖词。",
    defaultControls: {
      targetAcos: 0.38,
      minHarvestOrders: 2,
      minNegateClicks: 24,
      minBidClicks: 8,
      minRaiseOrders: 2,
      grossMarginPct: null,
      profitSafetyMarginPct: 0.08,
      tacosTarget: 0.24,
      budgetIncreasePct: 0.25,
      budgetDecreasePct: 0.1,
      minBudgetUsagePct: 0.8,
      minCampaignSpend: 8,
      minPlacementClicks: 10,
    },
  },
  profit: {
    id: "profit",
    label: "利润稳单",
    description: "优先守住利润安全线，再决定放量或收缩。",
    defaultControls: {
      targetAcos: 0.28,
      minHarvestOrders: 2,
      minNegateClicks: 16,
      minBidClicks: 10,
      minRaiseOrders: 2,
      grossMarginPct: null,
      profitSafetyMarginPct: 0.12,
      tacosTarget: 0.16,
      budgetIncreasePct: 0.18,
      budgetDecreasePct: 0.18,
      minBudgetUsagePct: 0.78,
      minCampaignSpend: 10,
      minPlacementClicks: 12,
    },
  },
  clearance: {
    id: "clearance",
    label: "清库存",
    description: "接受更高 ACOS，优先清理低效流量后尽快出货。",
    defaultControls: {
      targetAcos: 0.45,
      minHarvestOrders: 1,
      minNegateClicks: 30,
      minBidClicks: 12,
      minRaiseOrders: 1,
      grossMarginPct: null,
      profitSafetyMarginPct: 0.04,
      tacosTarget: 0.26,
      budgetIncreasePct: 0.3,
      budgetDecreasePct: 0.15,
      minBudgetUsagePct: 0.86,
      minCampaignSpend: 12,
      minPlacementClicks: 14,
    },
  },
  "brand-defense": {
    id: "brand-defense",
    label: "品牌防守",
    description: "控制品牌词内耗，稳住核心搜索位置和转化质量。",
    defaultControls: {
      targetAcos: 0.22,
      minHarvestOrders: 2,
      minNegateClicks: 20,
      minBidClicks: 10,
      minRaiseOrders: 2,
      grossMarginPct: null,
      profitSafetyMarginPct: 0.1,
      tacosTarget: 0.14,
      budgetIncreasePct: 0.12,
      budgetDecreasePct: 0.12,
      minBudgetUsagePct: 0.72,
      minCampaignSpend: 8,
      minPlacementClicks: 10,
    },
  },
};

export const DEFAULT_TEMPLATE_ID: StrategyTemplateId = "profit";

export function getStrategyTemplate(templateId: StrategyTemplateId) {
  return STRATEGY_TEMPLATES[templateId] ?? STRATEGY_TEMPLATES[DEFAULT_TEMPLATE_ID];
}

export function buildControlsFromTemplate(
  templateId: StrategyTemplateId = DEFAULT_TEMPLATE_ID
): AnalysisControls {
  const template = getStrategyTemplate(templateId);
  return {
    templateId: template.id,
    ...template.defaultControls,
  };
}

export function mergeAnalysisControls(
  controls?: Partial<AnalysisControls>
): AnalysisControls {
  const templateId = controls?.templateId ?? DEFAULT_TEMPLATE_ID;
  const base = buildControlsFromTemplate(templateId);
  return {
    ...base,
    ...controls,
    templateId,
  };
}

export const DEFAULT_ANALYSIS_CONTROLS = buildControlsFromTemplate();
