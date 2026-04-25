import { randomUUID } from "node:crypto";

import postgres from "postgres";

import type { LegacyDiagnosisReport } from "@/lib/legacy-copy-diagnosis/types";

export type LegacyCopyDiagnosisJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed";

export type LegacyCopyDiagnosisJobPhase =
  | "queued"
  | "collecting_seller_sprite"
  | "building_rule_diagnosis"
  | "generating_ai_recommendations"
  | "finalizing"
  | "complete"
  | "failed";

export interface LegacyCopyDiagnosisJob {
  id: string;
  status: LegacyCopyDiagnosisJobStatus;
  phase: LegacyCopyDiagnosisJobPhase;
  phaseLabel: string;
  progress: number;
  marketplace: string;
  targetAsin: string;
  competitorCount: number;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  result: LegacyDiagnosisReport | null;
  error: string | null;
  code: string | null;
  store: "postgres" | "memory";
}

export type LegacyCopyDiagnosisJobPatch = Partial<
  Pick<
    LegacyCopyDiagnosisJob,
    | "status"
    | "phase"
    | "phaseLabel"
    | "progress"
    | "startedAt"
    | "completedAt"
    | "result"
    | "error"
    | "code"
  >
>;

type LegacyCopyDiagnosisDatabase = ReturnType<typeof postgres>;

interface LegacyCopyDiagnosisJobRow {
  id: string;
  status: LegacyCopyDiagnosisJobStatus;
  phase: LegacyCopyDiagnosisJobPhase;
  phase_label: string;
  progress: number;
  marketplace: string;
  target_asin: string;
  competitor_count: number;
  created_at: string | Date;
  updated_at: string | Date;
  started_at: string | Date | null;
  completed_at: string | Date | null;
  result_json: string | null;
  error_message: string | null;
  error_code: string | null;
}

const JOB_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_MEMORY_JOBS = 100;
const memoryJobs = new Map<string, LegacyCopyDiagnosisJob>();

let databaseSingleton: LegacyCopyDiagnosisDatabase | null = null;
let schemaReadyPromise: Promise<LegacyCopyDiagnosisDatabase | null> | null = null;

export function createLegacyCopyDiagnosisJobId(): string {
  return `lcd_${Date.now().toString(36)}_${randomUUID()
    .replace(/-/g, "")
    .slice(0, 16)}`;
}

export async function createLegacyCopyDiagnosisJob(input: {
  id?: string;
  marketplace: string;
  targetAsin: string;
  competitorCount: number;
}): Promise<LegacyCopyDiagnosisJob> {
  pruneMemoryJobs();

  const now = new Date().toISOString();
  const job: LegacyCopyDiagnosisJob = {
    id: input.id ?? createLegacyCopyDiagnosisJobId(),
    status: "queued",
    phase: "queued",
    phaseLabel: "Queued for diagnosis",
    progress: 0,
    marketplace: input.marketplace,
    targetAsin: input.targetAsin,
    competitorCount: input.competitorCount,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
    result: null,
    error: null,
    code: null,
    store: "memory",
  };

  memoryJobs.set(job.id, job);

  const database = await tryGetDatabase();
  if (database) {
    await ensureLegacyCopyDiagnosisJobStore();
    await database`
      INSERT INTO legacy_copy_diagnosis_jobs (
        id,
        status,
        phase,
        phase_label,
        progress,
        marketplace,
        target_asin,
        competitor_count,
        created_at,
        updated_at,
        started_at,
        completed_at,
        result_json,
        error_message,
        error_code
      ) VALUES (
        ${job.id},
        ${job.status},
        ${job.phase},
        ${job.phaseLabel},
        ${job.progress},
        ${job.marketplace},
        ${job.targetAsin},
        ${job.competitorCount},
        ${job.createdAt},
        ${job.updatedAt},
        ${job.startedAt},
        ${job.completedAt},
        ${null},
        ${job.error},
        ${job.code}
      )
    `;
    await pruneDatabaseJobs(database);
    return { ...job, store: "postgres" };
  }

  return job;
}

export async function readLegacyCopyDiagnosisJob(
  id: string
): Promise<LegacyCopyDiagnosisJob | null> {
  const database = await tryGetDatabase();
  if (database) {
    await ensureLegacyCopyDiagnosisJobStore();
    const rows = await database<LegacyCopyDiagnosisJobRow[]>`
      SELECT *
      FROM legacy_copy_diagnosis_jobs
      WHERE id = ${id}
      LIMIT 1
    `;

    if (rows[0]) {
      return rowToJob(rows[0], "postgres");
    }
  }

  return memoryJobs.get(id) ?? null;
}

export async function updateLegacyCopyDiagnosisJob(
  id: string,
  patch: LegacyCopyDiagnosisJobPatch
): Promise<LegacyCopyDiagnosisJob | null> {
  const current = (await readLegacyCopyDiagnosisJob(id)) ?? memoryJobs.get(id);

  if (!current) {
    return null;
  }

  const next: LegacyCopyDiagnosisJob = {
    ...current,
    ...patch,
    progress:
      typeof patch.progress === "number"
        ? Math.max(0, Math.min(100, Math.round(patch.progress)))
        : current.progress,
    updatedAt: new Date().toISOString(),
  };

  memoryJobs.set(id, { ...next, store: "memory" });

  const database = await tryGetDatabase();
  if (database) {
    await ensureLegacyCopyDiagnosisJobStore();
    await database`
      UPDATE legacy_copy_diagnosis_jobs
      SET
        status = ${next.status},
        phase = ${next.phase},
        phase_label = ${next.phaseLabel},
        progress = ${next.progress},
        updated_at = ${next.updatedAt},
        started_at = ${next.startedAt},
        completed_at = ${next.completedAt},
        result_json = ${next.result ? JSON.stringify(next.result) : null},
        error_message = ${next.error},
        error_code = ${next.code}
      WHERE id = ${id}
    `;
    return { ...next, store: "postgres" };
  }

  return { ...next, store: "memory" };
}

function getLegacyCopyDiagnosisDatabaseUrl(): string | null {
  const rawValue =
    process.env.LEGACY_COPY_DIAGNOSIS_DATABASE_URL?.trim() ||
    process.env.COMPETITOR_MONITOR_DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    "";

  if (!rawValue || !/^postgres(ql)?:\/\//i.test(rawValue)) {
    return null;
  }

  return rawValue;
}

async function tryGetDatabase(): Promise<LegacyCopyDiagnosisDatabase | null> {
  const databaseUrl = getLegacyCopyDiagnosisDatabaseUrl();

  if (!databaseUrl) {
    return null;
  }

  if (!databaseSingleton) {
    databaseSingleton = postgres(databaseUrl, {
      max: 1,
      idle_timeout: 20,
      connect_timeout: 15,
      prepare: false,
    });
  }

  return databaseSingleton;
}

async function ensureLegacyCopyDiagnosisJobStore(): Promise<LegacyCopyDiagnosisDatabase | null> {
  if (!schemaReadyPromise) {
    schemaReadyPromise = initializeSchema().catch((error) => {
      schemaReadyPromise = null;
      console.warn("[legacy-copy-diagnosis/jobs] database unavailable", error);
      return null;
    });
  }

  return schemaReadyPromise;
}

async function initializeSchema(): Promise<LegacyCopyDiagnosisDatabase | null> {
  const database = await tryGetDatabase();

  if (!database) {
    return null;
  }

  await database`
    CREATE TABLE IF NOT EXISTS legacy_copy_diagnosis_jobs (
      id text PRIMARY KEY,
      status text NOT NULL,
      phase text NOT NULL,
      phase_label text NOT NULL,
      progress integer NOT NULL,
      marketplace text NOT NULL,
      target_asin text NOT NULL,
      competitor_count integer NOT NULL,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL,
      started_at timestamptz,
      completed_at timestamptz,
      result_json text,
      error_message text,
      error_code text
    )
  `;

  await database`
    CREATE INDEX IF NOT EXISTS idx_legacy_copy_diagnosis_jobs_updated
    ON legacy_copy_diagnosis_jobs (updated_at DESC)
  `;

  return database;
}

async function pruneDatabaseJobs(
  database: LegacyCopyDiagnosisDatabase
): Promise<void> {
  await database`
    DELETE FROM legacy_copy_diagnosis_jobs
    WHERE created_at < NOW() - INTERVAL '24 hours'
  `;
}

function pruneMemoryJobs(): void {
  const now = Date.now();

  for (const [id, job] of memoryJobs) {
    if (now - Date.parse(job.createdAt) > JOB_TTL_MS) {
      memoryJobs.delete(id);
    }
  }

  if (memoryJobs.size <= MAX_MEMORY_JOBS) {
    return;
  }

  const oldest = Array.from(memoryJobs.values()).sort(
    (left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt)
  );

  for (const job of oldest.slice(0, memoryJobs.size - MAX_MEMORY_JOBS)) {
    memoryJobs.delete(job.id);
  }
}

function rowToJob(
  row: LegacyCopyDiagnosisJobRow,
  store: LegacyCopyDiagnosisJob["store"]
): LegacyCopyDiagnosisJob {
  return {
    id: row.id,
    status: row.status,
    phase: row.phase,
    phaseLabel: row.phase_label,
    progress: row.progress,
    marketplace: row.marketplace,
    targetAsin: row.target_asin,
    competitorCount: row.competitor_count,
    createdAt: dateToIso(row.created_at),
    updatedAt: dateToIso(row.updated_at),
    startedAt: row.started_at ? dateToIso(row.started_at) : null,
    completedAt: row.completed_at ? dateToIso(row.completed_at) : null,
    result: parseResult(row.result_json),
    error: row.error_message,
    code: row.error_code,
    store,
  };
}

function dateToIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function parseResult(value: string | null): LegacyDiagnosisReport | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as LegacyDiagnosisReport;
  } catch {
    return null;
  }
}
