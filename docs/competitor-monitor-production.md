# Competitor Monitor Production Release

## Durable database

The competitor-monitor module now expects a PostgreSQL connection string in
`COMPETITOR_MONITOR_DATABASE_URL`.

Recommended providers:

- Neon
- Vercel Postgres
- Supabase Postgres
- RDS / Aurora PostgreSQL

Example:

```env
COMPETITOR_MONITOR_DATABASE_URL=postgresql://username:password@host:5432/database?sslmode=require
```

The runtime also falls back to `POSTGRES_URL` or `DATABASE_URL` if your hosting
platform already injects one of those values.

## Daily sync

`vercel.json` now schedules `/api/competitor-monitor/sync/daily` once per day
at `01:00 UTC`.

The route accepts:

- `GET` for Vercel Cron
- `POST` for manual or external scheduler calls

Auth is accepted from either:

- `COMPETITOR_MONITOR_CRON_SECRET`
- `CRON_SECRET`

For Vercel Cron, set `CRON_SECRET` to the same value as
`COMPETITOR_MONITOR_CRON_SECRET`.

## Release checklist

1. Set `COMPETITOR_MONITOR_DATABASE_URL`
2. Set `COMPETITOR_MONITOR_CRON_SECRET`
3. Set `CRON_SECRET` to the same value
4. Set `COMPETITOR_MONITOR_DEFAULT_MARKETPLACE`
5. Redeploy
6. Verify `/competitor-monitor`
7. Verify `/api/competitor-monitor/dashboard`
8. Verify `/api/competitor-monitor/sync/daily` via authorized request

## Notes

- The old local sqlite file path is no longer a valid production setting.
- Existing sqlite data is not auto-migrated into PostgreSQL.
