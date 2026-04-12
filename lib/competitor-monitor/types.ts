import type {
  CompetitorListing,
  ReviewData,
  TrafficKeyword,
} from "@/lib/types";

export type CompetitorMonitorSyncTrigger = "manual" | "cron";

export type CompetitorMonitorSyncStatus = "running" | "completed" | "failed";

export type CompetitorMonitorAlertType =
  | "price_drop"
  | "price_increase"
  | "rating_drop"
  | "rating_increase"
  | "review_growth"
  | "review_drop"
  | "bsr_improved"
  | "bsr_declined";

export type CompetitorMonitorAlertSeverity = "info" | "warning" | "critical";

export type CompetitorMonitorAlertStatus = "open" | "resolved";

export interface CompetitorMonitorMarketInput {
  id?: string;
  name: string;
  marketplace?: string;
  description?: string;
  asins: string[];
  isActive?: boolean;
}

export interface CompetitorMonitorMarketListItem {
  id: string;
  name: string;
  marketplace: string;
  description: string;
  isActive: boolean;
  asinCount: number;
  activeAlertCount: number;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CompetitorMonitorSnapshotSummary {
  id: string;
  capturedAt: string;
  title: string;
  price: number;
  rating: number;
  reviews: number;
  monthlySales: number;
  bsr: number;
  mainImage: string;
}

export interface CompetitorMonitorMarketAsinSummary {
  asin: string;
  marketplace: string;
  lastSyncedAt: string | null;
  lastChangedAt: string | null;
  activeAlertCount: number;
  latestSnapshot: CompetitorMonitorSnapshotSummary | null;
}

export interface CompetitorMonitorMarketDetail {
  id: string;
  name: string;
  marketplace: string;
  description: string;
  isActive: boolean;
  asinCount: number;
  activeAlertCount: number;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
  asins: CompetitorMonitorMarketAsinSummary[];
  recentAlerts: CompetitorMonitorAlert[];
}

export interface CompetitorMonitorDashboardSummary {
  totalMarkets: number;
  activeMarkets: number;
  trackedAsins: number;
  uniqueAsins: number;
  activeAlerts: number;
  lastSyncedAt: string | null;
  defaultMarketplace: string;
}

export interface CompetitorMonitorDashboardResponse {
  summary: CompetitorMonitorDashboardSummary;
  markets: CompetitorMonitorMarketListItem[];
  alerts: CompetitorMonitorAlert[];
}

export interface CompetitorMonitorMarketListResponse {
  markets: CompetitorMonitorMarketListItem[];
}

export interface CompetitorMonitorMarketDetailResponse {
  market: CompetitorMonitorMarketDetail;
}

export interface CompetitorMonitorMarketMutationResponse {
  market: CompetitorMonitorMarketDetail;
  created: boolean;
}

export interface CompetitorMonitorAlertMarketRef {
  id: string;
  name: string;
  marketplace: string;
}

export interface CompetitorMonitorAlert {
  id: string;
  asin: string;
  marketplace: string;
  type: CompetitorMonitorAlertType;
  severity: CompetitorMonitorAlertSeverity;
  status: CompetitorMonitorAlertStatus;
  title: string;
  message: string;
  createdAt: string;
  resolvedAt: string | null;
  snapshotId: string;
  previousSnapshotId: string | null;
  diff: Record<string, number | string | null>;
  markets: CompetitorMonitorAlertMarketRef[];
}

export interface CompetitorMonitorAlertListResponse {
  alerts: CompetitorMonitorAlert[];
}

export interface CompetitorMonitorAsinDetail {
  asin: string;
  marketplace: string;
  lastSyncedAt: string | null;
  lastChangedAt: string | null;
  markets: CompetitorMonitorAlertMarketRef[];
  latestSnapshot: (CompetitorMonitorSnapshotSummary & {
    bulletPoints: string[];
    attributes: Record<string, string>;
  }) | null;
  snapshotHistory: CompetitorMonitorSnapshotSummary[];
  keywords: TrafficKeyword[];
  negativeReviews: ReviewData[];
  positiveReviews: ReviewData[];
  alerts: CompetitorMonitorAlert[];
}

export interface CompetitorMonitorAsinDetailResponse {
  asin: CompetitorMonitorAsinDetail;
}

export interface CompetitorMonitorSyncAsinResult {
  asin: string;
  marketplace: string;
  status: "synced" | "unchanged" | "failed";
  snapshotId: string | null;
  alertsCreated: number;
  error: string | null;
}

export interface CompetitorMonitorSyncMarketResult {
  marketId: string;
  name: string;
  marketplace: string;
  totalAsins: number;
  syncedAsins: number;
  unchangedAsins: number;
  failedAsins: number;
}

export interface CompetitorMonitorSyncSummary {
  runId: string;
  trigger: CompetitorMonitorSyncTrigger;
  startedAt: string;
  finishedAt: string;
  marketId: string | null;
  totalMarkets: number;
  totalAsins: number;
  syncedAsins: number;
  unchangedAsins: number;
  failedAsins: number;
  alertsCreated: number;
  marketResults: CompetitorMonitorSyncMarketResult[];
  asinResults: CompetitorMonitorSyncAsinResult[];
}

export interface CompetitorMonitorSyncResponse {
  sync: CompetitorMonitorSyncSummary;
}

export interface CompetitorMonitorAsinObservation {
  marketplace: string;
  asin: string;
  listing: CompetitorListing;
  negativeReviews: ReviewData[];
  positiveReviews: ReviewData[];
  keywords: TrafficKeyword[];
  fingerprint: string;
  observedAt: string;
}

export interface CompetitorMonitorComparableSnapshot {
  id: string;
  marketplace: string;
  asin: string;
  capturedAt: string;
  title: string;
  price: number;
  rating: number;
  reviews: number;
  monthlySales: number;
  bsr: number;
  mainImage: string;
}

export interface CompetitorMonitorAlertCandidate {
  type: CompetitorMonitorAlertType;
  severity: CompetitorMonitorAlertSeverity;
  title: string;
  message: string;
  diff: Record<string, number | string | null>;
}

export interface CompetitorMonitorPersistObservationResult {
  snapshotId: string | null;
  changed: boolean;
  alertsCreated: number;
}
