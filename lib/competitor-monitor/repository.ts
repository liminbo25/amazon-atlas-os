import { createHash, randomUUID } from "node:crypto";

import type { ReviewData, TrafficKeyword } from "@/lib/types";

import {
  ensureCompetitorMonitorDatabase,
  type CompetitorMonitorDatabase,
} from "./database";
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
  keywords_json: string;
  negative_reviews_json: string;
  positive_reviews_json: string;
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
  last_synced_at: string;
  last_changed_at: string | null;
  last_error: string | null;
}

type QueryRow = Record<string, unknown>;
type StatementParams = Record<string, unknown>;

let repositorySingleton: CompetitorMonitorRepository | null = null;

export function getCompetitorMonitorRepository(): CompetitorMonitorRepository {
  if (!repositorySingleton) {
    repositorySingleton = new CompetitorMonitorRepository();
  }

  return repositorySingleton;
}

export class CompetitorMonitorRepository {
  private async readDb(): Promise<CompetitorMonitorDatabase> {
    return ensureCompetitorMonitorDatabase();
  }

  private async transaction<T>(
    task: (db: CompetitorMonitorDatabase) => Promise<T>
  ): Promise<T> {
    const database = await this.readDb();
    const result = await database.begin(async (tx) =>
      task(tx as unknown as CompetitorMonitorDatabase)
    );
    return result as T;
  }

  async saveMarket(input: {
    id?: string;
    name: string;
    marketplace: string;
    description: string;
    isActive: boolean;
    asins: string[];
  }): Promise<{ marketId: string; created: boolean }> {
    return this.transaction(async (db) => {
      const existing = input.id ? await this.getMarketRow(input.id, db) : null;
      const marketId = normalizeIdentifier(input.id) || randomUUID();
      const now = isoNow();

      if (!existing) {
        await runNamed(
          db,
          `
            INSERT INTO competitor_monitor_markets (
              id, name, marketplace, description, is_active, created_at, updated_at
            ) VALUES (
              :id, :name, :marketplace, :description, :isActive, :createdAt, :updatedAt
            )
          `,
          {
            id: marketId,
            name: input.name,
            marketplace: input.marketplace,
            description: input.description,
            isActive: input.isActive ? 1 : 0,
            createdAt: now,
            updatedAt: now,
          }
        );
      } else {
        await runNamed(
          db,
          `
            UPDATE competitor_monitor_markets
            SET
              name = :name,
              marketplace = :marketplace,
              description = :description,
              is_active = :isActive,
              updated_at = :updatedAt
            WHERE id = :id
          `,
          {
            id: marketId,
            name: input.name,
            marketplace: input.marketplace,
            description: input.description,
            isActive: input.isActive ? 1 : 0,
            updatedAt: now,
          }
        );
      }

      await runNamed(
        db,
        `DELETE FROM competitor_monitor_market_asins WHERE market_id = :marketId`,
        { marketId }
      );

      for (const [index, asin] of input.asins.entries()) {
        await runNamed(
          db,
          `
            INSERT INTO competitor_monitor_market_asins (
              market_id, asin, sort_order, created_at
            ) VALUES (
              :marketId, :asin, :sortOrder, :createdAt
            )
          `,
          {
            marketId,
            asin,
            sortOrder: index,
            createdAt: now,
          }
        );
      }

      return {
        marketId,
        created: !existing,
      };
    });
  }
  async listMarkets(): Promise<CompetitorMonitorMarketListItem[]> {
    const db = await this.readDb();
    const rows = await allNamed(
      db,
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
    );

    return rows.map(mapMarketListItem);
  }

  async listMarketConfigs(options: {
    activeOnly?: boolean;
    marketId?: string | null;
  } = {}): Promise<CompetitorMonitorMarketConfigRecord[]> {
    const db = await this.readDb();
    const rows = await allNamed(
      db,
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
      `,
      {
        marketId: options.marketId ?? null,
        activeOnly: options.activeOnly ? 1 : 0,
      }
    );

    return Promise.all(
      rows.map(async (row) => ({
        id: getString(row.id),
        name: getString(row.name),
        marketplace: getString(row.marketplace),
        description: getString(row.description),
        isActive: getBoolean(row.is_active),
        lastSyncedAt: getNullableString(row.last_synced_at),
        asins: await this.listMarketAsins(getString(row.id), db),
      }))
    );
  }

  async getMarketDetail(marketId: string): Promise<CompetitorMonitorMarketDetail | null> {
    const db = await this.readDb();
    const row = await this.getMarketRow(marketId, db);
    if (!row) {
      return null;
    }

    const market = mapMarketListItem({
      ...row,
      asin_count: await this.countMarketAsins(marketId, db),
      active_alert_count: await this.countMarketOpenAlerts(
        marketId,
        getString(row.marketplace),
        db
      ),
    });

    const asinRows = await allNamed(
      db,
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
        JOIN competitor_monitor_markets m ON m.id = ma.market_id
        LEFT JOIN competitor_monitor_asins a
          ON a.asin = ma.asin AND a.marketplace = m.marketplace
        LEFT JOIN competitor_monitor_snapshots s ON s.id = a.current_snapshot_id
        WHERE ma.market_id = :marketId
        ORDER BY ma.sort_order ASC, ma.asin ASC
      `,
      { marketId }
    );

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
      recentAlerts: await this.listAlerts({ marketId, limit: 20, status: "open" }, db),
    };
  }
  async getDashboardSummary(
    defaultMarketplace: string
  ): Promise<CompetitorMonitorDashboardSummary> {
    const db = await this.readDb();
    const row = await getNamed(
      db,
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
              JOIN competitor_monitor_markets m ON m.id = ma.market_id
            ) AS distinct_market_asins
          ) AS unique_asins,
          (SELECT COUNT(*) FROM competitor_monitor_alerts WHERE status = 'open') AS active_alerts,
          (SELECT MAX(last_synced_at) FROM competitor_monitor_markets) AS last_synced_at
      `
    );

    return {
      totalMarkets: getInteger(row?.total_markets),
      activeMarkets: getInteger(row?.active_markets),
      trackedAsins: getInteger(row?.tracked_asins),
      uniqueAsins: getInteger(row?.unique_asins),
      activeAlerts: getInteger(row?.active_alerts),
      lastSyncedAt: getNullableString(row?.last_synced_at),
      defaultMarketplace,
    };
  }

  async getAsinDetail(asin: string, marketplace: string): Promise<CompetitorMonitorAsinDetail | null> {
    const db = await this.readDb();
    const stateRow = await this.getAsinStateRow(marketplace, asin, db);
    const markets = await this.listMarketsForAsin(marketplace, asin, db);

    if (!stateRow && markets.length === 0) {
      return null;
    }

    const currentSnapshotId = stateRow?.current_snapshot_id ?? null;
    const latestSnapshotRow = currentSnapshotId
      ? await this.getSnapshotRowById(currentSnapshotId, db)
      : null;

    const snapshotHistoryRows = await allNamed(
      db,
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
        WHERE marketplace = :marketplace AND asin = :asin
        ORDER BY captured_at DESC
        LIMIT 10
      `,
      { marketplace, asin }
    );

    return {
      asin,
      marketplace,
      lastSyncedAt: stateRow?.last_synced_at ?? null,
      lastChangedAt: stateRow?.last_changed_at ?? null,
      markets,
      latestSnapshot: latestSnapshotRow ? mapSnapshotDetail(latestSnapshotRow) : null,
      snapshotHistory: snapshotHistoryRows.map(mapSnapshotSummary),
      keywords: parseKeywordRows(latestSnapshotRow?.keywords_json),
      negativeReviews: parseReviewRows(
        latestSnapshotRow?.negative_reviews_json,
        marketplace,
        asin
      ),
      positiveReviews: parseReviewRows(
        latestSnapshotRow?.positive_reviews_json,
        marketplace,
        asin
      ),
      alerts: await this.listAlerts({ asin, marketplace, status: "open", limit: 50 }, db),
    };
  }

  async listAlerts(
    options: {
      marketId?: string;
      marketplace?: string;
      asin?: string;
      status?: CompetitorMonitorAlertStatus | "all";
      limit?: number;
    } = {},
    dbSession?: CompetitorMonitorDatabase
  ): Promise<CompetitorMonitorAlert[]> {
    const db = dbSession ?? (await this.readDb());
    const rows = await allNamed(
      db,
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
              JOIN competitor_monitor_markets m ON m.id = ma.market_id
              WHERE ma.market_id = :marketId
                AND ma.asin = al.asin
                AND m.marketplace = al.marketplace
            )
          )
        ORDER BY CASE al.status WHEN 'open' THEN 0 ELSE 1 END, al.created_at DESC
        LIMIT :limit
      `,
      {
        marketId: options.marketId ?? null,
        marketplace: options.marketplace ?? null,
        asin: options.asin ?? null,
        status: options.status && options.status !== "all" ? options.status : null,
        limit: Math.max(1, Math.min(options.limit ?? 50, 200)),
      }
    );

    const marketsByAlert = await Promise.all(
      rows.map((row) => this.listMarketsForAsin(getString(row.marketplace), getString(row.asin), db))
    );

    return rows.map((row, index) => ({
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
      markets: marketsByAlert[index] ?? [],
    }));
  }
  async getCurrentComparableSnapshot(
    marketplace: string,
    asin: string,
    dbSession?: CompetitorMonitorDatabase
  ): Promise<CompetitorMonitorComparableSnapshot | null> {
    const db = dbSession ?? (await this.readDb());
    const row = await getNamed(
      db,
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
        JOIN competitor_monitor_snapshots s ON s.id = a.current_snapshot_id
        WHERE a.marketplace = :marketplace AND a.asin = :asin
      `,
      { marketplace, asin }
    );

    return row
      ? {
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
        }
      : null;
  }

  async persistObservation(input: {
    observation: CompetitorMonitorAsinObservation;
    alertCandidates: CompetitorMonitorAlertCandidate[];
  }): Promise<CompetitorMonitorPersistObservationResult> {
    return this.transaction(async (db) => {
      const currentState = await this.getAsinStateRow(
        input.observation.marketplace,
        input.observation.asin,
        db
      );
      const currentSnapshot = currentState?.current_snapshot_id
        ? await this.getSnapshotRowById(currentState.current_snapshot_id, db)
        : null;
      const now = input.observation.observedAt;

      await this.ensureAsinStateExists(input.observation.marketplace, input.observation.asin, now, db);

      if (currentSnapshot && currentSnapshot.fingerprint === input.observation.fingerprint) {
        await runNamed(
          db,
          `
            UPDATE competitor_monitor_asins
            SET last_synced_at = :lastSyncedAt, updated_at = :updatedAt, last_error = NULL
            WHERE marketplace = :marketplace AND asin = :asin
          `,
          {
            marketplace: input.observation.marketplace,
            asin: input.observation.asin,
            lastSyncedAt: now,
            updatedAt: now,
          }
        );

        return { snapshotId: currentSnapshot.id, changed: false, alertsCreated: 0 };
      }

      const snapshotId = randomUUID();
      const reviews = dedupeReviews(
        input.observation.marketplace,
        input.observation.asin,
        [...input.observation.negativeReviews, ...input.observation.positiveReviews]
      );

      await runNamed(
        db,
        `
          INSERT INTO competitor_monitor_snapshots (
            id, marketplace, asin, captured_at, fingerprint, title,
            bullet_points_json, attributes_json, keywords_json,
            negative_reviews_json, positive_reviews_json,
            price, rating, reviews_count, monthly_sales, bsr, main_image,
            negative_review_count, positive_review_count, total_review_observations
          ) VALUES (
            :id, :marketplace, :asin, :capturedAt, :fingerprint, :title,
            :bulletPointsJson, :attributesJson, :keywordsJson,
            :negativeReviewsJson, :positiveReviewsJson,
            :price, :rating, :reviewsCount, :monthlySales, :bsr, :mainImage,
            :negativeReviewCount, :positiveReviewCount, :totalReviewObservations
          )
        `,
        {
          id: snapshotId,
          marketplace: input.observation.marketplace,
          asin: input.observation.asin,
          capturedAt: now,
          fingerprint: input.observation.fingerprint,
          title: input.observation.listing.title,
          bulletPointsJson: JSON.stringify(input.observation.listing.bulletPoints),
          attributesJson: JSON.stringify(input.observation.listing.attributes),
          keywordsJson: JSON.stringify(input.observation.keywords),
          negativeReviewsJson: JSON.stringify(input.observation.negativeReviews),
          positiveReviewsJson: JSON.stringify(input.observation.positiveReviews),
          price: input.observation.listing.price,
          rating: input.observation.listing.rating,
          reviewsCount: input.observation.listing.reviews,
          monthlySales: input.observation.listing.monthlySales,
          bsr: input.observation.listing.bsr,
          mainImage: input.observation.listing.mainImage,
          negativeReviewCount: input.observation.negativeReviews.length,
          positiveReviewCount: input.observation.positiveReviews.length,
          totalReviewObservations: reviews.length,
        }
      );

      await runNamed(
        db,
        `
          UPDATE competitor_monitor_asins
          SET
            current_snapshot_id = :snapshotId,
            last_synced_at = :lastSyncedAt,
            last_changed_at = :lastChangedAt,
            last_error = NULL,
            updated_at = :updatedAt
          WHERE marketplace = :marketplace AND asin = :asin
        `,
        {
          marketplace: input.observation.marketplace,
          asin: input.observation.asin,
          snapshotId,
          lastSyncedAt: now,
          lastChangedAt: now,
          updatedAt: now,
        }
      );

      await runNamed(
        db,
        `
          UPDATE competitor_monitor_alerts
          SET status = 'resolved', resolved_at = :resolvedAt
          WHERE marketplace = :marketplace AND asin = :asin AND status = 'open'
        `,
        {
          marketplace: input.observation.marketplace,
          asin: input.observation.asin,
          resolvedAt: now,
        }
      );

      for (const candidate of input.alertCandidates) {
        await runNamed(
          db,
          `
            INSERT INTO competitor_monitor_alerts (
              id, marketplace, asin, snapshot_id, previous_snapshot_id,
              alert_type, severity, status, title, message, diff_json, created_at, resolved_at
            ) VALUES (
              :id, :marketplace, :asin, :snapshotId, :previousSnapshotId,
              :alertType, :severity, 'open', :title, :message, :diffJson, :createdAt, NULL
            )
          `,
          {
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
          }
        );
      }

      return { snapshotId, changed: true, alertsCreated: input.alertCandidates.length };
    });
  }

  async markAsinSyncFailure(params: {
    marketplace: string;
    asin: string;
    errorMessage: string;
    observedAt: string;
  }): Promise<void> {
    await this.transaction(async (db) => {
      await this.ensureAsinStateExists(params.marketplace, params.asin, params.observedAt, db);
      await runNamed(
        db,
        `
          UPDATE competitor_monitor_asins
          SET last_synced_at = :lastSyncedAt, last_error = :lastError, updated_at = :updatedAt
          WHERE marketplace = :marketplace AND asin = :asin
        `,
        {
          marketplace: params.marketplace,
          asin: params.asin,
          lastSyncedAt: params.observedAt,
          lastError: params.errorMessage,
          updatedAt: params.observedAt,
        }
      );
    });
  }
  async markMarketsSynced(marketIds: string[], syncedAt: string): Promise<void> {
    if (marketIds.length === 0) {
      return;
    }

    await this.transaction(async (db) => {
      for (const marketId of marketIds) {
        await runNamed(
          db,
          `
            UPDATE competitor_monitor_markets
            SET last_synced_at = :lastSyncedAt, updated_at = :updatedAt
            WHERE id = :marketId
          `,
          {
            marketId,
            lastSyncedAt: syncedAt,
            updatedAt: syncedAt,
          }
        );
      }
    });
  }

  async createSyncRun(input: {
    triggerType: CompetitorMonitorSyncTrigger;
    requestedMarketId: string | null;
  }): Promise<CompetitorMonitorSyncRunRecord> {
    const db = await this.readDb();
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

    await runNamed(
      db,
      `
        INSERT INTO competitor_monitor_runs (
          id, trigger_type, status, requested_market_id, started_at, summary_json, error_message
        ) VALUES (
          :id, :triggerType, :status, :requestedMarketId, :startedAt, :summaryJson, NULL
        )
      `,
      {
        id: run.id,
        triggerType: run.triggerType,
        status: run.status,
        requestedMarketId: run.requestedMarketId,
        startedAt: run.startedAt,
        summaryJson: JSON.stringify(run.summary),
      }
    );

    return run;
  }

  async completeSyncRun(runId: string, summary: Record<string, unknown>): Promise<void> {
    const db = await this.readDb();
    await runNamed(
      db,
      `
        UPDATE competitor_monitor_runs
        SET status = 'completed', finished_at = :finishedAt, summary_json = :summaryJson, error_message = NULL
        WHERE id = :runId
      `,
      {
        runId,
        finishedAt: isoNow(),
        summaryJson: JSON.stringify(summary),
      }
    );
  }

  async failSyncRun(
    runId: string,
    errorMessage: string,
    summary: Record<string, unknown> = {}
  ): Promise<void> {
    const db = await this.readDb();
    await runNamed(
      db,
      `
        UPDATE competitor_monitor_runs
        SET status = 'failed', finished_at = :finishedAt, summary_json = :summaryJson, error_message = :errorMessage
        WHERE id = :runId
      `,
      {
        runId,
        finishedAt: isoNow(),
        summaryJson: JSON.stringify(summary),
        errorMessage,
      }
    );
  }

  private async getMarketRow(marketId: string, db: CompetitorMonitorDatabase): Promise<QueryRow | null> {
    return getNamed(
      db,
      `
        SELECT id, name, marketplace, description, is_active, last_synced_at, created_at, updated_at
        FROM competitor_monitor_markets
        WHERE id = :marketId
      `,
      { marketId }
    );
  }

  private async countMarketAsins(marketId: string, db: CompetitorMonitorDatabase): Promise<number> {
    const row = await getNamed(
      db,
      `SELECT COUNT(*) AS total FROM competitor_monitor_market_asins WHERE market_id = :marketId`,
      { marketId }
    );
    return getInteger(row?.total);
  }

  private async countMarketOpenAlerts(
    marketId: string,
    marketplace: string,
    db: CompetitorMonitorDatabase
  ): Promise<number> {
    const row = await getNamed(
      db,
      `
        SELECT COUNT(*) AS total
        FROM competitor_monitor_alerts al
        WHERE al.status = 'open'
          AND al.marketplace = :marketplace
          AND EXISTS (
            SELECT 1
            FROM competitor_monitor_market_asins ma
            WHERE ma.market_id = :marketId AND ma.asin = al.asin
          )
      `,
      { marketId, marketplace }
    );
    return getInteger(row?.total);
  }

  private async listMarketAsins(marketId: string, db: CompetitorMonitorDatabase): Promise<string[]> {
    const rows = await allNamed(
      db,
      `
        SELECT asin
        FROM competitor_monitor_market_asins
        WHERE market_id = :marketId
        ORDER BY sort_order ASC, asin ASC
      `,
      { marketId }
    );
    return rows.map((row) => getString(row.asin));
  }

  private async listMarketsForAsin(
    marketplace: string,
    asin: string,
    db: CompetitorMonitorDatabase
  ): Promise<CompetitorMonitorAlertMarketRef[]> {
    const rows = await allNamed(
      db,
      `
        SELECT m.id, m.name, m.marketplace
        FROM competitor_monitor_market_asins ma
        JOIN competitor_monitor_markets m ON m.id = ma.market_id
        WHERE ma.asin = :asin AND m.marketplace = :marketplace
        ORDER BY m.created_at ASC
      `,
      { marketplace, asin }
    );

    return rows.map((row) => ({
      id: getString(row.id),
      name: getString(row.name),
      marketplace: getString(row.marketplace),
    }));
  }
  private async getAsinStateRow(
    marketplace: string,
    asin: string,
    db: CompetitorMonitorDatabase
  ): Promise<AsinStateRow | null> {
    const row = await getNamed(
      db,
      `
        SELECT marketplace, asin, current_snapshot_id, last_synced_at, last_changed_at, last_error
        FROM competitor_monitor_asins
        WHERE marketplace = :marketplace AND asin = :asin
      `,
      { marketplace, asin }
    );

    return row
      ? {
          marketplace: getString(row.marketplace),
          asin: getString(row.asin),
          current_snapshot_id: getNullableString(row.current_snapshot_id),
          last_synced_at: getString(row.last_synced_at),
          last_changed_at: getNullableString(row.last_changed_at),
          last_error: getNullableString(row.last_error),
        }
      : null;
  }

  private async ensureAsinStateExists(
    marketplace: string,
    asin: string,
    observedAt: string,
    db: CompetitorMonitorDatabase
  ): Promise<void> {
    await runNamed(
      db,
      `
        INSERT INTO competitor_monitor_asins (
          marketplace, asin, current_snapshot_id, first_seen_at, last_synced_at,
          last_changed_at, last_error, created_at, updated_at
        ) VALUES (
          :marketplace, :asin, NULL, :firstSeenAt, :lastSyncedAt,
          NULL, NULL, :createdAt, :updatedAt
        )
        ON CONFLICT(marketplace, asin) DO NOTHING
      `,
      {
        marketplace,
        asin,
        firstSeenAt: observedAt,
        lastSyncedAt: observedAt,
        createdAt: observedAt,
        updatedAt: observedAt,
      }
    );
  }

  private async getSnapshotRowById(
    snapshotId: string,
    db: CompetitorMonitorDatabase
  ): Promise<SnapshotRow | null> {
    const row = await getNamed(
      db,
      `
        SELECT
          id, marketplace, asin, captured_at, fingerprint, title,
          bullet_points_json, attributes_json, keywords_json,
          negative_reviews_json, positive_reviews_json,
          price, rating, reviews_count, monthly_sales, bsr, main_image,
          negative_review_count, positive_review_count, total_review_observations
        FROM competitor_monitor_snapshots
        WHERE id = :snapshotId
      `,
      { snapshotId }
    );

    return row ? mapSnapshotRow(row) : null;
  }
}
async function runNamed(
  db: CompetitorMonitorDatabase,
  statement: string,
  params: StatementParams = {}
): Promise<void> {
  const compiled = compileNamedStatement(statement, params);
  await db.unsafe(compiled.text, compiled.values as never[]);
}

async function allNamed(
  db: CompetitorMonitorDatabase,
  statement: string,
  params: StatementParams = {}
): Promise<QueryRow[]> {
  const compiled = compileNamedStatement(statement, params);
  const rows = await db.unsafe(compiled.text, compiled.values as never[]);
  return rows as unknown as QueryRow[];
}

async function getNamed(
  db: CompetitorMonitorDatabase,
  statement: string,
  params: StatementParams = {}
): Promise<QueryRow | null> {
  const rows = await allNamed(db, statement, params);
  return rows[0] ?? null;
}

function compileNamedStatement(
  statement: string,
  params: StatementParams
): { text: string; values: unknown[] } {
  const values: unknown[] = [];
  const indexes = new Map<string, number>();

  const text = statement.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (_match, key) => {
    if (!(key in params)) {
      throw new Error(`Missing competitor-monitor SQL parameter "${key}".`);
    }

    if (indexes.has(key)) {
      return `$${indexes.get(key)}`;
    }

    values.push(params[key]);
    indexes.set(key, values.length);
    return `$${values.length}`;
  });

  return { text, values };
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

function mapSnapshotSummary(
  row: QueryRow | SnapshotRow
): CompetitorMonitorSnapshotSummary {
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

function mapSnapshotDetail(row: SnapshotRow) {
  return {
    ...mapSnapshotSummary(row),
    bulletPoints: parseJsonStringArray(row.bullet_points_json),
    attributes: parseJsonStringMap(row.attributes_json),
  };
}

function mapSnapshotRow(row: QueryRow): SnapshotRow {
  return {
    id: getString(row.id),
    marketplace: getString(row.marketplace),
    asin: getString(row.asin),
    captured_at: getString(row.captured_at),
    fingerprint: getString(row.fingerprint),
    title: getString(row.title),
    bullet_points_json: getString(row.bullet_points_json),
    attributes_json: getString(row.attributes_json),
    keywords_json: getString(row.keywords_json),
    negative_reviews_json: getString(row.negative_reviews_json),
    positive_reviews_json: getString(row.positive_reviews_json),
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

function parseKeywordRows(value: unknown): TrafficKeyword[] {
  const parsed = parseJsonArray(value);
  return parsed
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }

      return {
        keyword: getString((item as Record<string, unknown>).keyword),
        searchVolume: getInteger((item as Record<string, unknown>).searchVolume),
        organicRank: getInteger((item as Record<string, unknown>).organicRank),
        sponsoredRank:
          (item as Record<string, unknown>).sponsoredRank === null ||
          (item as Record<string, unknown>).sponsoredRank === undefined
            ? null
            : getInteger((item as Record<string, unknown>).sponsoredRank),
        conversionShare: getNumber((item as Record<string, unknown>).conversionShare),
      } satisfies TrafficKeyword;
    })
    .filter((item): item is TrafficKeyword => item !== null && item.keyword.length > 0);
}
function parseReviewRows(value: unknown, marketplace: string, asin: string): ReviewData[] {
  const parsed = parseJsonArray(value);
  return parsed
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }

      const row = item as Record<string, unknown>;
      const baseReview: ReviewData = {
        id: "",
        asin,
        rating: getNumber(row.rating),
        title: getString(row.title),
        content: getString(row.content),
        date: getString(row.date),
        verifiedPurchase: getBoolean(row.verifiedPurchase),
        helpfulVotes: getInteger(row.helpfulVotes),
      };
      const review: ReviewData = {
        ...baseReview,
        id: getString(row.id) || buildReviewKey(marketplace, asin, baseReview),
      };

      return review.title || review.content ? review : null;
    })
    .filter((item): item is ReviewData => item !== null);
}

function parseJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== "string" || !value.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonStringArray(value: unknown): string[] {
  return parseJsonArray(value).filter((item): item is string => typeof item === "string");
}

function parseJsonStringMap(value: unknown): Record<string, string> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.fromEntries(
      Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string")
    );
  }

  if (typeof value !== "string" || !value.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string")
    );
  } catch {
    return {};
  }
}

function parseJsonRecord(value: unknown): Record<string, number | string | null> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.fromEntries(
      Object.entries(value).filter((entry) => {
        const currentValue = entry[1];
        return typeof currentValue === "number" || typeof currentValue === "string" || currentValue === null;
      })
    );
  }

  if (typeof value !== "string" || !value.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return parseJsonRecord(parsed);
  } catch {
    return {};
  }
}

function dedupeReviews(marketplace: string, asin: string, reviews: ReviewData[]): ReviewData[] {
  const uniqueReviews = new Map<string, ReviewData>();
  reviews.forEach((review) => {
    uniqueReviews.set(buildReviewKey(marketplace, asin, review), review);
  });
  return Array.from(uniqueReviews.values());
}

function buildReviewKey(marketplace: string, asin: string, review: ReviewData): string {
  return createHash("sha256")
    .update([
      marketplace,
      asin,
      review.rating,
      review.date,
      review.title.trim(),
      review.content.trim(),
    ].join("|"))
    .digest("hex");
}

function normalizeIdentifier(value: string | undefined): string {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function getString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function getNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function getNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
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
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "t";
  }
  return false;
}

function isoNow(): string {
  return new Date().toISOString();
}
