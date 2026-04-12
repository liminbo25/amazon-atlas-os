import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import { RouteError } from "@/lib/ai-route-helpers";
import type { ReviewData, TrafficKeyword } from "@/lib/types";

import type {
  CompetitorMonitorAlert,
  CompetitorMonitorAlertCandidate,
  CompetitorMonitorAlertMarketRef,
  CompetitorMonitorAlertStatus,
  CompetitorMonitorComparableSnapshot,
  CompetitorMonitorDashboardSummary,
  CompetitorMonitorMarketAsinSummary,
  CompetitorMonitorMarketDetail,
  CompetitorMonitorMarketListItem,
  CompetitorMonitorPersistObservationResult,
  CompetitorMonitorSnapshotSummary,
  CompetitorMonitorSyncStatus,
  CompetitorMonitorSyncTrigger,
  CompetitorMonitorAsinObservation,
  CompetitorMonitorAsinDetail,
} from "./types";

interface CompetitorMonitorMarketConfigRecord {
  id: string;
  name: string;
  marketplace: string;
  description: string;
  isActive: boolean;
  lastSyncedAt: string | null;
  asins: string[];
}

interface CompetitorMonitorSyncRunRecord {
  id: string;
  triggerType: CompetitorMonitorSyncTrigger;
  status: CompetitorMonitorSyncStatus;
  requestedMarketId: string | null;
  startedAt: string;
  finishedAt: string | null;
  summary: Record<string, unknown>;
  errorMessage: string | null;
}

interface SnapshotRow {
  id: string;
  marketplace: string;
  asin: string;
  captured_at: string;
  fingerprint: string;
  title: string;
  bullet_points_json: string;
  attributes_json: string;
  price: number;
  rating: number;
  reviews_count: number;
  monthly_sales: number;
  bsr: number;
  main_image: string;
  negative_review_count: number;
  positive_review_count: number;
  total_review_observations: number;
}

interface AsinStateRow {
  marketplace: string;
  asin: string;
  current_snapshot_id: string | null;
  first_seen_at: string;
  last_synced_at: string;
  last_changed_at: string | null;
  last_error: string | null;
}

type QueryRow = Record<string, unknown>;

let repositorySingleton: CompetitorMonitorRepository | null = null;

export function getCompetitorMonitorRepository(): CompetitorMonitorRepository {
  if (!repositorySingleton) {
    repositorySingleton = new CompetitorMonitorRepository();
  }

  return repositorySingleton;
}

export class CompetitorMonitorRepository {
  private readonly db: DatabaseSync;

  constructor() {
    const databasePath = resolveDatabasePath();
    mkdirSync(path.dirname(databasePath), { recursive: true });

    this.db = new DatabaseSync(databasePath);
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.ensureSchema();
  }

  transaction<T>(task: () => T): T {
    this.db.exec("BEGIN");
    try {
      const result = task();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  saveMarket(input: {
    id?: string;
    name: string;
    marketplace: string;
    description: string;
    isActive: boolean;
    asins: string[];
  }): { marketId: string; created: boolean } {
    return this.transaction(() => {
      const existing = input.id ? this.getMarketRow(input.id) : null;
      const marketId = normalizeIdentifier(input.id) || randomUUID();
      const now = isoNow();
      const created = existing === null;

      if (created) {
        this.db
          .prepare(
            `
              INSERT INTO competitor_monitor_markets (
                id,
                name,
                marketplace,
                description,
                is_active,
                created_at,
                updated_at
              ) VALUES (
                :id,
                :name,
                :marketplace,
                :description,
                :isActive,
                :createdAt,
                :updatedAt
              )
            `
          )
          .run({
            id: marketId,
            name: input.name,
            marketplace: input.marketplace,
            description: input.description,
            isActive: input.isActive ? 1 : 0,
            createdAt: now,
            updatedAt: now,
          });
      } else {
        this.db
          .prepare(
            `
              UPDATE competitor_monitor_markets
              SET
                name = :name,
                marketplace = :marketplace,
                description = :description,
                is_active = :isActive,
                updated_at = :updatedAt
              WHERE id = :id
            `
          )
          .run({
            id: marketId,
            name: input.name,
            marketplace: input.marketplace,
            description: input.description,
            isActive: input.isActive ? 1 : 0,
            updatedAt: now,
          });
      }

      this.db
        .prepare("DELETE FROM competitor_monitor_market_asins WHERE market_id = :marketId")
        .run({ marketId });

      const insertMarketAsin = this.db.prepare(
        `
          INSERT INTO competitor_monitor_market_asins (
            market_id,
            asin,
            sort_order,
            created_at
          ) VALUES (
            :marketId,
            :asin,
            :sortOrder,
            :createdAt
          )
        `
      );

      input.asins.forEach((asin, index) => {
        insertMarketAsin.run({
          marketId,
          asin,
          sortOrder: index,
          createdAt: now,
        });
      });

      return {
        marketId,
        created,
      };
    });
  }

  listMarkets(): CompetitorMonitorMarketListItem[] {
    const rows = this.db
      .prepare(
        `
          SELECT
            m.id,
            m.name,
            m.marketplace,
            m.description,
            m.is_active,
            m.last_synced_at,
            m.created_at,
            m.updated_at,
            (
              SELECT COUNT(*)
              FROM competitor_monitor_market_asins ma
              WHERE ma.market_id = m.id
            ) AS asin_count,
            (
              SELECT COUNT(*)
              FROM competitor_monitor_alerts al
              WHERE al.status = 'open'
                AND EXISTS (
                  SELECT 1
                  FROM competitor_monitor_market_asins ma2
                  WHERE ma2.market_id = m.id
                    AND ma2.asin = al.asin
                    AND al.marketplace = m.marketplace
                )
            ) AS active_alert_count
          FROM competitor_monitor_markets m
          ORDER BY m.updated_at DESC, m.created_at DESC
        `
      )
      .all() as QueryRow[];

    return rows.map((row) => mapMarketListItem(row));
  }

  listMarketConfigs(options: {
    activeOnly?: boolean;
    marketId?: string | null;
  } = {}): CompetitorMonitorMarketConfigRecord[] {
    const rows = this.db
      .prepare(
        `
          SELECT
            m.id,
            m.name,
            m.marketplace,
            m.description,
            m.is_active,
            m.last_synced_at
          FROM competitor_monitor_markets m
          WHERE (:marketId IS NULL OR m.id = :marketId)
            AND (:activeOnly = 0 OR m.is_active = 1)
          ORDER BY m.created_at ASC
        `
      )
      .all({
        marketId: options.marketId ?? null,
        activeOnly: options.activeOnly ? 1 : 0,
      }) as QueryRow[];

    return rows.map((row) => ({
      id: getString(row.id),
      name: getString(row.name),
      marketplace: getString(row.marketplace),
      description: getString(row.description),
      isActive: getBoolean(row.is_active),
      lastSyncedAt: getNullableString(row.last_synced_at),
      asins: this.listMarketAsins(getString(row.id)),
    }));
  }

  getMarketDetail(marketId: string): CompetitorMonitorMarketDetail | null {
    const row = this.getMarketRow(marketId);
    if (!row) {
      return null;
    }

    const market = mapMarketListItem({
      ...row,
      asin_count: this.countMarketAsins(marketId),
      active_alert_count: this.countMarketOpenAlerts(marketId, getString(row.marketplace)),
    });

    const asinRows = this.db
      .prepare(
        `
          SELECT
            ma.asin,
            m.marketplace,
            a.last_synced_at,
            a.last_changed_at,
            (
              SELECT COUNT(*)
              FROM competitor_monitor_alerts al
              WHERE al.asin = ma.asin
                AND al.marketplace = m.marketplace
                AND al.status = 'open'
            ) AS active_alert_count,
            s.id AS snapshot_id,
            s.captured_at,
            s.title,
            s.price,
            s.rating,
            s.reviews_count,
            s.monthly_sales,
            s.bsr,
            s.main_image
          FROM competitor_monitor_market_asins ma
          JOIN competitor_monitor_markets m
            ON m.id = ma.market_id
          LEFT JOIN competitor_monitor_asins a
            ON a.asin = ma.asin
           AND a.marketplace = m.marketplace
          LEFT JOIN competitor_monitor_snapshots s
            ON s.id = a.current_snapshot_id
          WHERE ma.market_id = :marketId
          ORDER BY ma.sort_order ASC, ma.asin ASC
        `
      )
      .all({ marketId }) as QueryRow[];

    const asins: CompetitorMonitorMarketAsinSummary[] = asinRows.map((asinRow) => ({
      asin: getString(asinRow.asin),
      marketplace: getString(asinRow.marketplace),
      lastSyncedAt: getNullableString(asinRow.last_synced_at),
      lastChangedAt: getNullableString(asinRow.last_changed_at),
      activeAlertCount: getInteger(asinRow.active_alert_count),
      latestSnapshot: getNullableString(asinRow.snapshot_id)
        ? mapSnapshotSummary({
            id: asinRow.snapshot_id,
            captured_at: asinRow.captured_at,
            title: asinRow.title,
            price: asinRow.price,
            rating: asinRow.rating,
            reviews_count: asinRow.reviews_count,
            monthly_sales: asinRow.monthly_sales,
            bsr: asinRow.bsr,
            main_image: asinRow.main_image,
          })
        : null,
    }));

    return {
      ...market,
      asins,
      recentAlerts: this.listAlerts({
        marketId,
        limit: 20,
        status: "open",
      }),
    };
  }

  getDashboardSummary(defaultMarketplace: string): CompetitorMonitorDashboardSummary {
    const row = this.db
      .prepare(
        `
          SELECT
            (SELECT COUNT(*) FROM competitor_monitor_markets) AS total_markets,
            (SELECT COUNT(*) FROM competitor_monitor_markets WHERE is_active = 1) AS active_markets,
            (SELECT COUNT(*) FROM competitor_monitor_market_asins) AS tracked_asins,
            (
              SELECT COUNT(*)
              FROM (
                SELECT DISTINCT m.marketplace || ':' || ma.asin AS market_asin_key
                FROM competitor_monitor_market_asins ma
                JOIN competitor_monitor_markets m
                  ON m.id = ma.market_id
              )
            ) AS unique_asins,
            (SELECT COUNT(*) FROM competitor_monitor_alerts WHERE status = 'open') AS active_alerts,
            (SELECT MAX(last_synced_at) FROM competitor_monitor_markets) AS last_synced_at
        `
      )
      .get() as QueryRow;

    return {
      totalMarkets: getInteger(row.total_markets),
      activeMarkets: getInteger(row.active_markets),
      trackedAsins: getInteger(row.tracked_asins),
      uniqueAsins: getInteger(row.unique_asins),
      activeAlerts: getInteger(row.active_alerts),
      lastSyncedAt: getNullableString(row.last_synced_at),
      defaultMarketplace,
    };
  }

  getAsinDetail(asin: string, marketplace: string): CompetitorMonitorAsinDetail | null {
    const stateRow = this.db
      .prepare(
        `
          SELECT
            a.marketplace,
            a.asin,
            a.current_snapshot_id,
            a.last_synced_at,
            a.last_changed_at
          FROM competitor_monitor_asins a
          WHERE a.marketplace = :marketplace
            AND a.asin = :asin
        `
      )
      .get({ marketplace, asin }) as QueryRow | undefined;

    const markets = this.listMarketsForAsin(marketplace, asin);

    if (!stateRow && markets.length === 0) {
      return null;
    }

    const currentSnapshotId = stateRow ? getNullableString(stateRow.current_snapshot_id) : null;
    const latestSnapshot = currentSnapshotId
      ? this.getSnapshotDetailById(currentSnapshotId)
      : null;

    const snapshotHistoryRows = this.db
      .prepare(
        `
          SELECT
            id,
            captured_at,
            title,
            price,
            rating,
            reviews_count,
            monthly_sales,
            bsr,
            main_image
          FROM competitor_monitor_snapshots
          WHERE marketplace = :marketplace
            AND asin = :asin
          ORDER BY captured_at DESC
          LIMIT 10
        `
      )
      .all({ marketplace, asin }) as QueryRow[];

    return {
      asin,
      marketplace,
      lastSyncedAt: stateRow ? getNullableString(stateRow.last_synced_at) : null,
      lastChangedAt: stateRow ? getNullableString(stateRow.last_changed_at) : null,
      markets,
      latestSnapshot,
      snapshotHistory: snapshotHistoryRows.map((row) => mapSnapshotSummary(row)),
      keywords: currentSnapshotId ? this.listKeywordsForSnapshot(currentSnapshotId) : [],
      negativeReviews: this.listReviewsForAsin(marketplace, asin, "negative"),
      positiveReviews: this.listReviewsForAsin(marketplace, asin, "positive"),
      alerts: this.listAlerts({
        asin,
        marketplace,
        status: "open",
        limit: 50,
      }),
    };
  }

  listAlerts(options: {
    marketId?: string;
    marketplace?: string;
    asin?: string;
    status?: CompetitorMonitorAlertStatus | "all";
    limit?: number;
  } = {}): CompetitorMonitorAlert[] {
    const rows = this.db
      .prepare(
        `
          SELECT
            al.id,
            al.marketplace,
            al.asin,
            al.snapshot_id,
            al.previous_snapshot_id,
            al.alert_type,
            al.severity,
            al.status,
            al.title,
            al.message,
            al.diff_json,
            al.created_at,
            al.resolved_at
          FROM competitor_monitor_alerts al
          WHERE (:marketplace IS NULL OR al.marketplace = :marketplace)
            AND (:asin IS NULL OR al.asin = :asin)
            AND (:status IS NULL OR al.status = :status)
            AND (
              :marketId IS NULL
              OR EXISTS (
                SELECT 1
                FROM competitor_monitor_market_asins ma
                JOIN competitor_monitor_markets m
                  ON m.id = ma.market_id
                WHERE ma.market_id = :marketId
                  AND ma.asin = al.asin
                  AND m.marketplace = al.marketplace
              )
            )
          ORDER BY
            CASE al.status WHEN 'open' THEN 0 ELSE 1 END,
            al.created_at DESC
          LIMIT :limit
        `
      )
      .all({
        marketId: options.marketId ?? null,
        marketplace: options.marketplace ?? null,
        asin: options.asin ?? null,
        status:
          options.status && options.status !== "all"
            ? options.status
            : null,
        limit: Math.max(1, Math.min(options.limit ?? 50, 200)),
      }) as QueryRow[];

    return rows.map((row) => ({
      id: getString(row.id),
      asin: getString(row.asin),
      marketplace: getString(row.marketplace),
      type: getString(row.alert_type) as CompetitorMonitorAlert["type"],
      severity: getString(row.severity) as CompetitorMonitorAlert["severity"],
      status: getString(row.status) as CompetitorMonitorAlert["status"],
      title: getString(row.title),
      message: getString(row.message),
      createdAt: getString(row.created_at),
      resolvedAt: getNullableString(row.resolved_at),
      snapshotId: getString(row.snapshot_id),
      previousSnapshotId: getNullableString(row.previous_snapshot_id),
      diff: parseJsonRecord(row.diff_json),
      markets: this.listMarketsForAsin(
        getString(row.marketplace),
        getString(row.asin)
      ),
    }));
  }

  getCurrentComparableSnapshot(
    marketplace: string,
    asin: string
  ): CompetitorMonitorComparableSnapshot | null {
    const row = this.db
      .prepare(
        `
          SELECT
            s.id,
            s.marketplace,
            s.asin,
            s.captured_at,
            s.title,
            s.price,
            s.rating,
            s.reviews_count,
            s.monthly_sales,
            s.bsr,
            s.main_image
          FROM competitor_monitor_asins a
          JOIN competitor_monitor_snapshots s
            ON s.id = a.current_snapshot_id
          WHERE a.marketplace = :marketplace
            AND a.asin = :asin
        `
      )
      .get({ marketplace, asin }) as QueryRow | undefined;

    if (!row) {
      return null;
    }

    return {
      id: getString(row.id),
      marketplace: getString(row.marketplace),
      asin: getString(row.asin),
      capturedAt: getString(row.captured_at),
      title: getString(row.title),
      price: getNumber(row.price),
      rating: getNumber(row.rating),
      reviews: getInteger(row.reviews_count),
      monthlySales: getInteger(row.monthly_sales),
      bsr: getInteger(row.bsr),
      mainImage: getString(row.main_image),
    };
  }

  persistObservation(input: {
    observation: CompetitorMonitorAsinObservation;
    alertCandidates: CompetitorMonitorAlertCandidate[];
  }): CompetitorMonitorPersistObservationResult {
    return this.transaction(() => {
      const currentState = this.getAsinStateRow(
        input.observation.marketplace,
        input.observation.asin
      );
      const currentSnapshot = currentState?.current_snapshot_id
        ? this.getSnapshotRowById(currentState.current_snapshot_id)
        : null;
      const now = input.observation.observedAt;

      this.ensureAsinStateExists(input.observation.marketplace, input.observation.asin, now);

      if (
        currentSnapshot &&
        currentSnapshot.fingerprint === input.observation.fingerprint
      ) {
        this.db
          .prepare(
            `
              UPDATE competitor_monitor_asins
              SET
                last_synced_at = :lastSyncedAt,
                updated_at = :updatedAt,
                last_error = NULL
              WHERE marketplace = :marketplace
                AND asin = :asin
            `
          )
          .run({
            marketplace: input.observation.marketplace,
            asin: input.observation.asin,
            lastSyncedAt: now,
            updatedAt: now,
          });

        return {
          snapshotId: currentSnapshot.id,
          changed: false,
          alertsCreated: 0,
        };
      }

      const snapshotId = randomUUID();
      const reviews = dedupeReviews([
        ...input.observation.negativeReviews,
        ...input.observation.positiveReviews,
      ]);

      this.db
        .prepare(
          `
            INSERT INTO competitor_monitor_snapshots (
              id,
              marketplace,
              asin,
              captured_at,
              fingerprint,
              title,
              bullet_points_json,
              attributes_json,
              price,
              rating,
              reviews_count,
              monthly_sales,
              bsr,
              main_image,
              negative_review_count,
              positive_review_count,
              total_review_observations
            ) VALUES (
              :id,
              :marketplace,
              :asin,
              :capturedAt,
              :fingerprint,
              :title,
              :bulletPointsJson,
              :attributesJson,
              :price,
              :rating,
              :reviewsCount,
              :monthlySales,
              :bsr,
              :mainImage,
              :negativeReviewCount,
              :positiveReviewCount,
              :totalReviewObservations
            )
          `
        )
        .run({
          id: snapshotId,
          marketplace: input.observation.marketplace,
          asin: input.observation.asin,
          capturedAt: now,
          fingerprint: input.observation.fingerprint,
          title: input.observation.listing.title,
          bulletPointsJson: JSON.stringify(input.observation.listing.bulletPoints),
          attributesJson: JSON.stringify(input.observation.listing.attributes),
          price: input.observation.listing.price,
          rating: input.observation.listing.rating,
          reviewsCount: input.observation.listing.reviews,
          monthlySales: input.observation.listing.monthlySales,
          bsr: input.observation.listing.bsr,
          mainImage: input.observation.listing.mainImage,
          negativeReviewCount: input.observation.negativeReviews.length,
          positiveReviewCount: input.observation.positiveReviews.length,
          totalReviewObservations: reviews.length,
        });

      const insertKeyword = this.db.prepare(
        `
          INSERT INTO competitor_monitor_keywords (
            snapshot_id,
            marketplace,
            asin,
            keyword,
            search_volume,
            organic_rank,
            sponsored_rank,
            conversion_share
          ) VALUES (
            :snapshotId,
            :marketplace,
            :asin,
            :keyword,
            :searchVolume,
            :organicRank,
            :sponsoredRank,
            :conversionShare
          )
        `
      );

      input.observation.keywords.forEach((keyword) => {
        insertKeyword.run({
          snapshotId,
          marketplace: input.observation.marketplace,
          asin: input.observation.asin,
          keyword: keyword.keyword,
          searchVolume: keyword.searchVolume,
          organicRank: keyword.organicRank,
          sponsoredRank: keyword.sponsoredRank,
          conversionShare: keyword.conversionShare,
        });
      });

      const upsertReview = this.db.prepare(
        `
          INSERT INTO competitor_monitor_reviews (
            review_key,
            marketplace,
            asin,
            rating,
            title,
            content,
            review_date,
            verified_purchase,
            helpful_votes,
            first_seen_snapshot_id,
            first_seen_at,
            last_seen_snapshot_id,
            last_seen_at
          ) VALUES (
            :reviewKey,
            :marketplace,
            :asin,
            :rating,
            :title,
            :content,
            :reviewDate,
            :verifiedPurchase,
            :helpfulVotes,
            :firstSeenSnapshotId,
            :firstSeenAt,
            :lastSeenSnapshotId,
            :lastSeenAt
          )
          ON CONFLICT(review_key) DO UPDATE SET
            rating = excluded.rating,
            title = excluded.title,
            content = excluded.content,
            review_date = excluded.review_date,
            verified_purchase = excluded.verified_purchase,
            helpful_votes = excluded.helpful_votes,
            last_seen_snapshot_id = excluded.last_seen_snapshot_id,
            last_seen_at = excluded.last_seen_at
        `
      );

      reviews.forEach((review) => {
        const reviewKey = buildReviewKey(
          input.observation.marketplace,
          input.observation.asin,
          review
        );
        upsertReview.run({
          reviewKey,
          marketplace: input.observation.marketplace,
          asin: input.observation.asin,
          rating: review.rating,
          title: review.title,
          content: review.content,
          reviewDate: review.date,
          verifiedPurchase: review.verifiedPurchase ? 1 : 0,
          helpfulVotes: review.helpfulVotes,
          firstSeenSnapshotId: snapshotId,
          firstSeenAt: now,
          lastSeenSnapshotId: snapshotId,
          lastSeenAt: now,
        });
      });

      this.db
        .prepare(
          `
            UPDATE competitor_monitor_asins
            SET
              current_snapshot_id = :snapshotId,
              last_synced_at = :lastSyncedAt,
              last_changed_at = :lastChangedAt,
              last_error = NULL,
              updated_at = :updatedAt
            WHERE marketplace = :marketplace
              AND asin = :asin
          `
        )
        .run({
          marketplace: input.observation.marketplace,
          asin: input.observation.asin,
          snapshotId,
          lastSyncedAt: now,
          lastChangedAt: now,
          updatedAt: now,
        });

      this.db
        .prepare(
          `
            UPDATE competitor_monitor_alerts
            SET
              status = 'resolved',
              resolved_at = :resolvedAt
            WHERE marketplace = :marketplace
              AND asin = :asin
              AND status = 'open'
          `
        )
        .run({
          marketplace: input.observation.marketplace,
          asin: input.observation.asin,
          resolvedAt: now,
        });

      const insertAlert = this.db.prepare(
        `
          INSERT INTO competitor_monitor_alerts (
            id,
            marketplace,
            asin,
            snapshot_id,
            previous_snapshot_id,
            alert_type,
            severity,
            status,
            title,
            message,
            diff_json,
            created_at,
            resolved_at
          ) VALUES (
            :id,
            :marketplace,
            :asin,
            :snapshotId,
            :previousSnapshotId,
            :alertType,
            :severity,
            'open',
            :title,
            :message,
            :diffJson,
            :createdAt,
            NULL
          )
        `
      );

      input.alertCandidates.forEach((candidate) => {
        insertAlert.run({
          id: randomUUID(),
          marketplace: input.observation.marketplace,
          asin: input.observation.asin,
          snapshotId,
          previousSnapshotId: currentSnapshot?.id ?? null,
          alertType: candidate.type,
          severity: candidate.severity,
          title: candidate.title,
          message: candidate.message,
          diffJson: JSON.stringify(candidate.diff),
          createdAt: now,
        });
      });

      return {
        snapshotId,
        changed: true,
        alertsCreated: input.alertCandidates.length,
      };
    });
  }

  markAsinSyncFailure(params: {
    marketplace: string;
    asin: string;
    errorMessage: string;
    observedAt: string;
  }): void {
    this.transaction(() => {
      this.ensureAsinStateExists(params.marketplace, params.asin, params.observedAt);
      this.db
        .prepare(
          `
            UPDATE competitor_monitor_asins
            SET
              last_synced_at = :lastSyncedAt,
              last_error = :lastError,
              updated_at = :updatedAt
            WHERE marketplace = :marketplace
              AND asin = :asin
          `
        )
        .run({
          marketplace: params.marketplace,
          asin: params.asin,
          lastSyncedAt: params.observedAt,
          lastError: params.errorMessage,
          updatedAt: params.observedAt,
        });
    });
  }

  markMarketsSynced(marketIds: string[], syncedAt: string): void {
    if (marketIds.length === 0) {
      return;
    }

    this.transaction(() => {
      const statement = this.db.prepare(
        `
          UPDATE competitor_monitor_markets
          SET
            last_synced_at = :lastSyncedAt,
            updated_at = :updatedAt
          WHERE id = :marketId
        `
      );

      marketIds.forEach((marketId) => {
        statement.run({
          marketId,
          lastSyncedAt: syncedAt,
          updatedAt: syncedAt,
        });
      });
    });
  }

  createSyncRun(input: {
    triggerType: CompetitorMonitorSyncTrigger;
    requestedMarketId: string | null;
  }): CompetitorMonitorSyncRunRecord {
    const run: CompetitorMonitorSyncRunRecord = {
      id: randomUUID(),
      triggerType: input.triggerType,
      status: "running",
      requestedMarketId: input.requestedMarketId,
      startedAt: isoNow(),
      finishedAt: null,
      summary: {},
      errorMessage: null,
    };

    this.db
      .prepare(
        `
          INSERT INTO competitor_monitor_runs (
            id,
            trigger_type,
            status,
            requested_market_id,
            started_at,
            summary_json,
            error_message
          ) VALUES (
            :id,
            :triggerType,
            :status,
            :requestedMarketId,
            :startedAt,
            :summaryJson,
            NULL
          )
        `
      )
      .run({
        id: run.id,
        triggerType: run.triggerType,
        status: run.status,
        requestedMarketId: run.requestedMarketId,
        startedAt: run.startedAt,
        summaryJson: JSON.stringify(run.summary),
      });

    return run;
  }

  completeSyncRun(runId: string, summary: Record<string, unknown>): void {
    this.db
      .prepare(
        `
          UPDATE competitor_monitor_runs
          SET
            status = 'completed',
            finished_at = :finishedAt,
            summary_json = :summaryJson,
            error_message = NULL
          WHERE id = :runId
        `
      )
      .run({
        runId,
        finishedAt: isoNow(),
        summaryJson: JSON.stringify(summary),
      });
  }

  failSyncRun(
    runId: string,
    errorMessage: string,
    summary: Record<string, unknown> = {}
  ): void {
    this.db
      .prepare(
        `
          UPDATE competitor_monitor_runs
          SET
            status = 'failed',
            finished_at = :finishedAt,
            summary_json = :summaryJson,
            error_message = :errorMessage
          WHERE id = :runId
        `
      )
      .run({
        runId,
        finishedAt: isoNow(),
        summaryJson: JSON.stringify(summary),
        errorMessage,
      });
  }

  private getMarketRow(marketId: string): QueryRow | null {
    const row = this.db
      .prepare(
        `
          SELECT
            id,
            name,
            marketplace,
            description,
            is_active,
            last_synced_at,
            created_at,
            updated_at
          FROM competitor_monitor_markets
          WHERE id = :marketId
        `
      )
      .get({ marketId }) as QueryRow | undefined;

    return row ?? null;
  }

  private countMarketAsins(marketId: string): number {
    const row = this.db
      .prepare(
        `
          SELECT COUNT(*) AS total
          FROM competitor_monitor_market_asins
          WHERE market_id = :marketId
        `
      )
      .get({ marketId }) as QueryRow;

    return getInteger(row.total);
  }

  private countMarketOpenAlerts(marketId: string, marketplace: string): number {
    const row = this.db
      .prepare(
        `
          SELECT COUNT(*) AS total
          FROM competitor_monitor_alerts al
          WHERE al.status = 'open'
            AND al.marketplace = :marketplace
            AND EXISTS (
              SELECT 1
              FROM competitor_monitor_market_asins ma
              WHERE ma.market_id = :marketId
                AND ma.asin = al.asin
            )
        `
      )
      .get({ marketId, marketplace }) as QueryRow;

    return getInteger(row.total);
  }

  private listMarketAsins(marketId: string): string[] {
    const rows = this.db
      .prepare(
        `
          SELECT asin
          FROM competitor_monitor_market_asins
          WHERE market_id = :marketId
          ORDER BY sort_order ASC, asin ASC
        `
      )
      .all({ marketId }) as QueryRow[];

    return rows.map((row) => getString(row.asin));
  }

  private listMarketsForAsin(
    marketplace: string,
    asin: string
  ): CompetitorMonitorAlertMarketRef[] {
    const rows = this.db
      .prepare(
        `
          SELECT
            m.id,
            m.name,
            m.marketplace
          FROM competitor_monitor_market_asins ma
          JOIN competitor_monitor_markets m
            ON m.id = ma.market_id
          WHERE ma.asin = :asin
            AND m.marketplace = :marketplace
          ORDER BY m.created_at ASC
        `
      )
      .all({ marketplace, asin }) as QueryRow[];

    return rows.map((row) => ({
      id: getString(row.id),
      name: getString(row.name),
      marketplace: getString(row.marketplace),
    }));
  }

  private getSnapshotDetailById(snapshotId: string) {
    const row = this.db
      .prepare(
        `
          SELECT
            id,
            captured_at,
            title,
            bullet_points_json,
            attributes_json,
            price,
            rating,
            reviews_count,
            monthly_sales,
            bsr,
            main_image
          FROM competitor_monitor_snapshots
          WHERE id = :snapshotId
        `
      )
      .get({ snapshotId }) as QueryRow | undefined;

    if (!row) {
      return null;
    }

    return {
      ...mapSnapshotSummary(row),
      bulletPoints: parseJsonStringArray(row.bullet_points_json),
      attributes: parseJsonStringMap(row.attributes_json),
    };
  }

  private listKeywordsForSnapshot(snapshotId: string): TrafficKeyword[] {
    const rows = this.db
      .prepare(
        `
          SELECT
            keyword,
            search_volume,
            organic_rank,
            sponsored_rank,
            conversion_share
          FROM competitor_monitor_keywords
          WHERE snapshot_id = :snapshotId
          ORDER BY search_volume DESC, keyword ASC
          LIMIT 50
        `
      )
      .all({ snapshotId }) as QueryRow[];

    return rows.map((row) => ({
      keyword: getString(row.keyword),
      searchVolume: getInteger(row.search_volume),
      organicRank: getInteger(row.organic_rank),
      sponsoredRank:
        row.sponsored_rank === null || row.sponsored_rank === undefined
          ? null
          : getInteger(row.sponsored_rank),
      conversionShare: getNumber(row.conversion_share),
    }));
  }

  private listReviewsForAsin(
    marketplace: string,
    asin: string,
    sentiment: "negative" | "positive"
  ): ReviewData[] {
    const ratingFilter = sentiment === "negative" ? "<= 3" : ">= 4";
    const rows = this.db
      .prepare(
        `
          SELECT
            review_key,
            rating,
            title,
            content,
            review_date,
            verified_purchase,
            helpful_votes,
            last_seen_at
          FROM competitor_monitor_reviews
          WHERE marketplace = :marketplace
            AND asin = :asin
            AND rating ${ratingFilter}
          ORDER BY last_seen_at DESC, review_date DESC
          LIMIT 30
        `
      )
      .all({ marketplace, asin }) as QueryRow[];

    return rows.map((row) => ({
      id: getString(row.review_key),
      asin,
      rating: getNumber(row.rating),
      title: getString(row.title),
      content: getString(row.content),
      date: getString(row.review_date),
      verifiedPurchase: getBoolean(row.verified_purchase),
      helpfulVotes: getInteger(row.helpful_votes),
    }));
  }

  private getAsinStateRow(marketplace: string, asin: string): AsinStateRow | null {
    const row = this.db
      .prepare(
        `
          SELECT
            marketplace,
            asin,
            current_snapshot_id,
            first_seen_at,
            last_synced_at,
            last_changed_at,
            last_error
          FROM competitor_monitor_asins
          WHERE marketplace = :marketplace
            AND asin = :asin
        `
      )
      .get({ marketplace, asin }) as QueryRow | undefined;

    if (!row) {
      return null;
    }

    return {
      marketplace: getString(row.marketplace),
      asin: getString(row.asin),
      current_snapshot_id: getNullableString(row.current_snapshot_id),
      first_seen_at: getString(row.first_seen_at),
      last_synced_at: getString(row.last_synced_at),
      last_changed_at: getNullableString(row.last_changed_at),
      last_error: getNullableString(row.last_error),
    };
  }

  private ensureAsinStateExists(marketplace: string, asin: string, observedAt: string): void {
    this.db
      .prepare(
        `
          INSERT INTO competitor_monitor_asins (
            marketplace,
            asin,
            current_snapshot_id,
            first_seen_at,
            last_synced_at,
            last_changed_at,
            last_error,
            created_at,
            updated_at
          ) VALUES (
            :marketplace,
            :asin,
            NULL,
            :firstSeenAt,
            :lastSyncedAt,
            NULL,
            NULL,
            :createdAt,
            :updatedAt
          )
          ON CONFLICT(marketplace, asin) DO NOTHING
        `
      )
      .run({
        marketplace,
        asin,
        firstSeenAt: observedAt,
        lastSyncedAt: observedAt,
        createdAt: observedAt,
        updatedAt: observedAt,
      });
  }

  private getSnapshotRowById(snapshotId: string): SnapshotRow | null {
    const row = this.db
      .prepare(
        `
          SELECT
            id,
            marketplace,
            asin,
            captured_at,
            fingerprint,
            title,
            bullet_points_json,
            attributes_json,
            price,
            rating,
            reviews_count,
            monthly_sales,
            bsr,
            main_image,
            negative_review_count,
            positive_review_count,
            total_review_observations
          FROM competitor_monitor_snapshots
          WHERE id = :snapshotId
        `
      )
      .get({ snapshotId }) as QueryRow | undefined;

    if (!row) {
      return null;
    }

    return {
      id: getString(row.id),
      marketplace: getString(row.marketplace),
      asin: getString(row.asin),
      captured_at: getString(row.captured_at),
      fingerprint: getString(row.fingerprint),
      title: getString(row.title),
      bullet_points_json: getString(row.bullet_points_json),
      attributes_json: getString(row.attributes_json),
      price: getNumber(row.price),
      rating: getNumber(row.rating),
      reviews_count: getInteger(row.reviews_count),
      monthly_sales: getInteger(row.monthly_sales),
      bsr: getInteger(row.bsr),
      main_image: getString(row.main_image),
      negative_review_count: getInteger(row.negative_review_count),
      positive_review_count: getInteger(row.positive_review_count),
      total_review_observations: getInteger(row.total_review_observations),
    };
  }

  private ensureSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS competitor_monitor_markets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        marketplace TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        is_active INTEGER NOT NULL DEFAULT 1,
        last_synced_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS competitor_monitor_market_asins (
        market_id TEXT NOT NULL,
        asin TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        PRIMARY KEY (market_id, asin),
        FOREIGN KEY (market_id) REFERENCES competitor_monitor_markets(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS competitor_monitor_asins (
        marketplace TEXT NOT NULL,
        asin TEXT NOT NULL,
        current_snapshot_id TEXT,
        first_seen_at TEXT NOT NULL,
        last_synced_at TEXT NOT NULL,
        last_changed_at TEXT,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (marketplace, asin)
      );

      CREATE TABLE IF NOT EXISTS competitor_monitor_snapshots (
        id TEXT PRIMARY KEY,
        marketplace TEXT NOT NULL,
        asin TEXT NOT NULL,
        captured_at TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        title TEXT NOT NULL,
        bullet_points_json TEXT NOT NULL,
        attributes_json TEXT NOT NULL,
        price REAL NOT NULL,
        rating REAL NOT NULL,
        reviews_count INTEGER NOT NULL,
        monthly_sales INTEGER NOT NULL,
        bsr INTEGER NOT NULL,
        main_image TEXT NOT NULL,
        negative_review_count INTEGER NOT NULL,
        positive_review_count INTEGER NOT NULL,
        total_review_observations INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS competitor_monitor_keywords (
        snapshot_id TEXT NOT NULL,
        marketplace TEXT NOT NULL,
        asin TEXT NOT NULL,
        keyword TEXT NOT NULL,
        search_volume INTEGER NOT NULL,
        organic_rank INTEGER NOT NULL,
        sponsored_rank INTEGER,
        conversion_share REAL NOT NULL,
        PRIMARY KEY (snapshot_id, keyword),
        FOREIGN KEY (snapshot_id) REFERENCES competitor_monitor_snapshots(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS competitor_monitor_reviews (
        review_key TEXT PRIMARY KEY,
        marketplace TEXT NOT NULL,
        asin TEXT NOT NULL,
        rating REAL NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        review_date TEXT NOT NULL,
        verified_purchase INTEGER NOT NULL DEFAULT 0,
        helpful_votes INTEGER NOT NULL DEFAULT 0,
        first_seen_snapshot_id TEXT NOT NULL,
        first_seen_at TEXT NOT NULL,
        last_seen_snapshot_id TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS competitor_monitor_alerts (
        id TEXT PRIMARY KEY,
        marketplace TEXT NOT NULL,
        asin TEXT NOT NULL,
        snapshot_id TEXT NOT NULL,
        previous_snapshot_id TEXT,
        alert_type TEXT NOT NULL,
        severity TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        diff_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        resolved_at TEXT,
        FOREIGN KEY (snapshot_id) REFERENCES competitor_monitor_snapshots(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS competitor_monitor_runs (
        id TEXT PRIMARY KEY,
        trigger_type TEXT NOT NULL,
        status TEXT NOT NULL,
        requested_market_id TEXT,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        summary_json TEXT NOT NULL DEFAULT '{}',
        error_message TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_competitor_monitor_market_asins_market
      ON competitor_monitor_market_asins (market_id, sort_order, asin);

      CREATE INDEX IF NOT EXISTS idx_competitor_monitor_snapshots_lookup
      ON competitor_monitor_snapshots (marketplace, asin, captured_at DESC);

      CREATE INDEX IF NOT EXISTS idx_competitor_monitor_reviews_lookup
      ON competitor_monitor_reviews (marketplace, asin, last_seen_at DESC);

      CREATE INDEX IF NOT EXISTS idx_competitor_monitor_alerts_lookup
      ON competitor_monitor_alerts (status, created_at DESC, marketplace, asin);
    `);
  }
}

function resolveDatabasePath(): string {
  const rawValue = process.env.COMPETITOR_MONITOR_DATABASE_URL?.trim();
  if (!rawValue) {
    throw new RouteError(
      "COMPETITOR_MONITOR_DATABASE_URL is required for competitor-monitor.",
      {
        status: 500,
        code: "competitor_monitor_database_missing",
      }
    );
  }

  if (rawValue.startsWith("file:")) {
    return fileURLToPath(new URL(rawValue));
  }

  if (rawValue.startsWith("sqlite:")) {
    const asFileUrl = rawValue.replace(/^sqlite:/, "file:");
    try {
      return fileURLToPath(new URL(asFileUrl));
    } catch {
      return path.resolve(
        process.cwd(),
        rawValue.replace(/^sqlite:(\/\/)?/, "")
      );
    }
  }

  return path.resolve(process.cwd(), rawValue);
}

function mapMarketListItem(row: QueryRow): CompetitorMonitorMarketListItem {
  return {
    id: getString(row.id),
    name: getString(row.name),
    marketplace: getString(row.marketplace),
    description: getString(row.description),
    isActive: getBoolean(row.is_active),
    asinCount: getInteger(row.asin_count),
    activeAlertCount: getInteger(row.active_alert_count),
    lastSyncedAt: getNullableString(row.last_synced_at),
    createdAt: getString(row.created_at),
    updatedAt: getString(row.updated_at),
  };
}

function mapSnapshotSummary(row: QueryRow): CompetitorMonitorSnapshotSummary {
  return {
    id: getString(row.id),
    capturedAt: getString(row.captured_at),
    title: getString(row.title),
    price: getNumber(row.price),
    rating: getNumber(row.rating),
    reviews: getInteger(row.reviews_count),
    monthlySales: getInteger(row.monthly_sales),
    bsr: getInteger(row.bsr),
    mainImage: getString(row.main_image),
  };
}

function buildReviewKey(
  marketplace: string,
  asin: string,
  review: ReviewData
): string {
  return createHash("sha256")
    .update(
      [
        marketplace,
        asin,
        review.rating,
        review.date,
        review.title.trim().toLowerCase(),
        review.content.trim().toLowerCase(),
      ].join("|")
    )
    .digest("hex");
}

function dedupeReviews(reviews: ReviewData[]): ReviewData[] {
  const reviewMap = new Map<string, ReviewData>();

  reviews.forEach((review) => {
    const key = buildReviewKey("dedupe", review.asin, review);
    if (!reviewMap.has(key)) {
      reviewMap.set(key, review);
    }
  });

  return Array.from(reviewMap.values());
}

function parseJsonStringArray(value: unknown): string[] {
  if (typeof value !== "string" || !value.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function parseJsonStringMap(value: unknown): Record<string, string> {
  if (typeof value !== "string" || !value.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed)
        .map(([key, entryValue]) => [key, typeof entryValue === "string" ? entryValue : ""])
        .filter(([, entryValue]) => Boolean(entryValue))
    );
  } catch {
    return {};
  }
}

function parseJsonRecord(value: unknown): Record<string, number | string | null> {
  if (typeof value !== "string" || !value.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).map(([key, entryValue]) => [
        key,
        typeof entryValue === "number" ||
        typeof entryValue === "string" ||
        entryValue === null
          ? entryValue
          : String(entryValue),
      ])
    );
  } catch {
    return {};
  }
}

function normalizeIdentifier(value: string | undefined): string {
  return value?.trim() ?? "";
}

function getString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function getNullableString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function getNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : typeof value === "bigint"
      ? Number(value)
      : typeof value === "string" && value.trim()
        ? Number(value)
        : 0;
}

function getInteger(value: unknown): number {
  return Math.trunc(getNumber(value));
}

function getBoolean(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (typeof value === "bigint") {
    return value !== BigInt(0);
  }

  return value === "1" || value === "true";
}

function isoNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}
