import postgres from "postgres";

import { RouteError } from "@/lib/ai-route-helpers";

export type CompetitorMonitorDatabase = ReturnType<typeof postgres>;

let databaseSingleton: CompetitorMonitorDatabase | null = null;
let schemaReadyPromise: Promise<void> | null = null;

const SCHEMA_STATEMENTS = [
  `
    CREATE TABLE IF NOT EXISTS competitor_monitor_markets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      marketplace TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      last_synced_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS competitor_monitor_market_asins (
      market_id TEXT NOT NULL,
      asin TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      PRIMARY KEY (market_id, asin),
      FOREIGN KEY (market_id) REFERENCES competitor_monitor_markets(id) ON DELETE CASCADE
    )
  `,
  `
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
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS competitor_monitor_snapshots (
      id TEXT PRIMARY KEY,
      marketplace TEXT NOT NULL,
      asin TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      title TEXT NOT NULL,
      bullet_points_json TEXT NOT NULL,
      attributes_json TEXT NOT NULL,
      keywords_json TEXT NOT NULL DEFAULT '[]',
      negative_reviews_json TEXT NOT NULL DEFAULT '[]',
      positive_reviews_json TEXT NOT NULL DEFAULT '[]',
      price DOUBLE PRECISION NOT NULL,
      rating DOUBLE PRECISION NOT NULL,
      reviews_count INTEGER NOT NULL,
      monthly_sales INTEGER NOT NULL,
      bsr INTEGER NOT NULL,
      main_image TEXT NOT NULL,
      negative_review_count INTEGER NOT NULL,
      positive_review_count INTEGER NOT NULL,
      total_review_observations INTEGER NOT NULL
    )
  `,
  `
    ALTER TABLE IF EXISTS competitor_monitor_snapshots
    ADD COLUMN IF NOT EXISTS keywords_json TEXT NOT NULL DEFAULT '[]'
  `,
  `
    ALTER TABLE IF EXISTS competitor_monitor_snapshots
    ADD COLUMN IF NOT EXISTS negative_reviews_json TEXT NOT NULL DEFAULT '[]'
  `,
  `
    ALTER TABLE IF EXISTS competitor_monitor_snapshots
    ADD COLUMN IF NOT EXISTS positive_reviews_json TEXT NOT NULL DEFAULT '[]'
  `,
  `
    CREATE TABLE IF NOT EXISTS competitor_monitor_keywords (
      snapshot_id TEXT NOT NULL,
      marketplace TEXT NOT NULL,
      asin TEXT NOT NULL,
      keyword TEXT NOT NULL,
      search_volume INTEGER NOT NULL,
      organic_rank INTEGER NOT NULL,
      sponsored_rank INTEGER,
      conversion_share DOUBLE PRECISION NOT NULL,
      PRIMARY KEY (snapshot_id, keyword),
      FOREIGN KEY (snapshot_id) REFERENCES competitor_monitor_snapshots(id) ON DELETE CASCADE
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS competitor_monitor_reviews (
      review_key TEXT PRIMARY KEY,
      marketplace TEXT NOT NULL,
      asin TEXT NOT NULL,
      rating DOUBLE PRECISION NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      review_date TEXT NOT NULL,
      verified_purchase INTEGER NOT NULL DEFAULT 0,
      helpful_votes INTEGER NOT NULL DEFAULT 0,
      first_seen_snapshot_id TEXT NOT NULL,
      first_seen_at TEXT NOT NULL,
      last_seen_snapshot_id TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    )
  `,
  `
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
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS competitor_monitor_runs (
      id TEXT PRIMARY KEY,
      trigger_type TEXT NOT NULL,
      status TEXT NOT NULL,
      requested_market_id TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      summary_json TEXT NOT NULL DEFAULT '{}',
      error_message TEXT
    )
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_competitor_monitor_market_asins_market
    ON competitor_monitor_market_asins (market_id, sort_order, asin)
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_competitor_monitor_snapshots_lookup
    ON competitor_monitor_snapshots (marketplace, asin, captured_at DESC)
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_competitor_monitor_reviews_lookup
    ON competitor_monitor_reviews (marketplace, asin, last_seen_at DESC)
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_competitor_monitor_alerts_lookup
    ON competitor_monitor_alerts (status, created_at DESC, marketplace, asin)
  `,
];

export function getCompetitorMonitorDatabaseUrl(): string {
  const rawValue =
    process.env.COMPETITOR_MONITOR_DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    "";

  if (!rawValue) {
    throw new RouteError(
      "COMPETITOR_MONITOR_DATABASE_URL is required for competitor-monitor.",
      {
        status: 500,
        code: "competitor_monitor_database_missing",
      }
    );
  }

  if (!/^postgres(ql)?:\/\//i.test(rawValue)) {
    throw new RouteError(
      "COMPETITOR_MONITOR_DATABASE_URL must be a PostgreSQL connection string for production deployment.",
      {
        status: 500,
        code: "competitor_monitor_database_invalid",
      }
    );
  }

  return rawValue;
}

export function getCompetitorMonitorDatabase(): CompetitorMonitorDatabase {
  if (!databaseSingleton) {
    databaseSingleton = postgres(getCompetitorMonitorDatabaseUrl(), {
      max: 1,
      idle_timeout: 20,
      connect_timeout: 15,
      prepare: false,
    });
  }

  return databaseSingleton;
}

export async function ensureCompetitorMonitorDatabase(): Promise<CompetitorMonitorDatabase> {
  if (!schemaReadyPromise) {
    schemaReadyPromise = initializeSchema().catch((error) => {
      schemaReadyPromise = null;
      throw error;
    });
  }

  await schemaReadyPromise;
  return getCompetitorMonitorDatabase();
}

async function initializeSchema(): Promise<void> {
  const database = getCompetitorMonitorDatabase();

  for (const statement of SCHEMA_STATEMENTS) {
    await database.unsafe(statement);
  }
}
