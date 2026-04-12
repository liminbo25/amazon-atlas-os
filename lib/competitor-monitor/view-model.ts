export type CompetitorMonitorHealth = "healthy" | "watch" | "risk";

export type CompetitorMonitorMetricTone = "positive" | "negative" | "neutral";

export type CompetitorMonitorUiAlertSeverity = "info" | "warning" | "critical";

export type CompetitorMonitorUiAlertStatus = "open" | "resolved";

export interface CompetitorMonitorUiMeta {
  namespace: "competitor-monitor";
  source: "repository";
  generatedAt: string;
}

export interface CompetitorMonitorUiMetric {
  key: string;
  label: string;
  value: string;
  delta: string;
  tone: CompetitorMonitorMetricTone;
  description: string;
}

export interface CompetitorMonitorUiMarketRef {
  id: string;
  name: string;
  marketplace: string;
}

export interface CompetitorMonitorUiAlertDetailItem {
  label: string;
  value: string;
}

export interface CompetitorMonitorUiAlert {
  id: string;
  asin: string;
  severity: CompetitorMonitorUiAlertSeverity;
  status: CompetitorMonitorUiAlertStatus;
  typeLabel: string;
  title: string;
  message: string;
  createdAt: string;
  markets: CompetitorMonitorUiMarketRef[];
  detailItems: CompetitorMonitorUiAlertDetailItem[];
}

export interface CompetitorMonitorUiMarketSummary {
  marketId: string;
  marketName: string;
  marketplace: string;
  countryCode: string;
  region: string;
  currency: string;
  description: string;
  health: CompetitorMonitorHealth;
  asinCount: number;
  syncedAsinCount: number;
  coverageRate: number;
  activeAlertCount: number;
  criticalAlertCount: number;
  lastSyncedAt: string | null;
  heroAsin: string | null;
  averagePrice: number | null;
  averageRating: number | null;
}

export interface CompetitorMonitorUiAsinSummary {
  marketId: string;
  marketName: string;
  marketplace: string;
  currency: string;
  asin: string;
  title: string;
  health: CompetitorMonitorHealth;
  price: number | null;
  rating: number | null;
  reviewCount: number;
  monthlySales: number | null;
  bsr: number | null;
  alertCount: number;
  lastCapturedAt: string | null;
}

export interface CompetitorMonitorUiDashboardData {
  metrics: CompetitorMonitorUiMetric[];
  markets: CompetitorMonitorUiMarketSummary[];
  priorityAsins: CompetitorMonitorUiAsinSummary[];
  recentAlerts: CompetitorMonitorUiAlert[];
}

export interface CompetitorMonitorUiMarketListData {
  metrics: CompetitorMonitorUiMetric[];
  items: CompetitorMonitorUiMarketSummary[];
  filters: {
    query: string;
    health: string;
  };
}

export interface CompetitorMonitorUiMarketActivityPoint {
  date: string;
  averagePrice: number;
  syncedAsins: number;
  openAlerts: number;
}

export interface CompetitorMonitorUiMarketDetail {
  marketId: string;
  marketName: string;
  marketplace: string;
  countryCode: string;
  region: string;
  currency: string;
  description: string;
  health: CompetitorMonitorHealth;
  asinCount: number;
  syncedAsinCount: number;
  coverageRate: number;
  activeAlertCount: number;
  criticalAlertCount: number;
  lastSyncedAt: string | null;
  heroAsin: string | null;
  averagePrice: number | null;
  averageRating: number | null;
  activityTimeline: CompetitorMonitorUiMarketActivityPoint[];
  trackedAsins: CompetitorMonitorUiAsinSummary[];
  recentAlerts: CompetitorMonitorUiAlert[];
  notes: string[];
}

export interface CompetitorMonitorUiMarketDetailData {
  market: CompetitorMonitorUiMarketDetail;
}

export interface CompetitorMonitorUiKeywordSnapshot {
  keyword: string;
  organicRank: number;
  sponsoredRank: number | null;
  searchVolume: number;
  conversionShare: number;
}

export interface CompetitorMonitorUiRecentChange {
  id: string;
  happenedAt: string;
  type: string;
  summary: string;
}

export interface CompetitorMonitorUiComparableAsin {
  asin: string;
  marketId: string;
  marketName: string;
  title: string;
  brand: string;
  price: number | null;
  rating: number | null;
  monthlySales: number | null;
  alertCount: number;
}

export interface CompetitorMonitorUiAttributeItem {
  label: string;
  value: string;
}

export interface CompetitorMonitorUiAsinTimelinePoint {
  date: string;
  price: number;
  reviews: number;
  monthlySales: number;
}

export interface CompetitorMonitorUiAsinDetail {
  marketId: string | null;
  marketName: string;
  marketplace: string;
  countryCode: string;
  region: string;
  currency: string;
  asin: string;
  title: string;
  brand: string;
  health: CompetitorMonitorHealth;
  alertCount: number;
  price: number | null;
  rating: number | null;
  reviewCount: number;
  monthlySales: number | null;
  bsr: number | null;
  priceChange: number | null;
  reviewChange: number | null;
  lastCapturedAt: string | null;
  lastSyncedAt: string | null;
  bulletHighlights: string[];
  attributeItems: CompetitorMonitorUiAttributeItem[];
  timeline: CompetitorMonitorUiAsinTimelinePoint[];
  keywordSnapshots: CompetitorMonitorUiKeywordSnapshot[];
  recentChanges: CompetitorMonitorUiRecentChange[];
  comparableAsins: CompetitorMonitorUiComparableAsin[];
  alerts: CompetitorMonitorUiAlert[];
  markets: CompetitorMonitorUiMarketRef[];
}

export interface CompetitorMonitorUiAsinDetailData {
  asin: CompetitorMonitorUiAsinDetail;
}

export interface CompetitorMonitorUiAlertCenterData {
  metrics: CompetitorMonitorUiMetric[];
  items: CompetitorMonitorUiAlert[];
  filters: {
    query: string;
    marketId: string;
    severity: string;
    status: string;
  };
}

export interface CompetitorMonitorUiResponse<TData> {
  data: TData;
  meta: CompetitorMonitorUiMeta;
}
