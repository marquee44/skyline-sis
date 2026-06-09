# Skyline SIS — Progress

_Last updated: 2026-06-07 · HEAD `7f244b4` · deployed at https://sis.skyline-as.ae_

Admissions + enrollment pipeline for Skyline University Admission Services.
Build brief: [`skyline-sis-spec-v2.md`](skyline-sis-spec-v2.md). Replaces the
former Gibbon PHP install.

## Stack

- **Monorepo:** pnpm workspaces — `apps/api` (NestJS), `apps/web` (Next.js), `packages/db` (Prisma).
- **DB:** native PostgreSQL `skyline_sis` (role `skyline`) + Prisma.
- **Jobs:** pg-boss (queue inside Postgres — no Redis).
- **Auth:** Passport JWT + role guards (`student` / `staff` / `admin`).
- **Process mgr:** pm2 — `skyline-api` (:3001) + `skyline-web` (:3000) via `ecosystem.config.js`.
- **Edge:** nginx reverse proxy (Let's Encrypt) → Next on :3000, `/api` → NestJS on :3001.

## Build status — increments (spec §11)

All 14 increments landed. Mapping to API modules under `apps/api/src/`:

| # | Increment | Module(s) | Status |
|---|-----------|-----------|--------|
| 1 | Monorepo scaffold + Prisma schema + migrations | `prisma`, `health` | ✅ |
| 2 | Catalog admin (universities/programs/courses) | `catalog` | ✅ |
| 3 | Applicants + stage state machine | `applicants` | ✅ |
| 4 | Advisors + per-advisor availability | `advisors` | ✅ |
| 5 | Native booking (slots, atomic reserve, confirm email) | `booking`, `email` | ✅ |
| 6 | Zoom auto-link + booking reminder job | `zoom`, `jobs` | ✅ |
| 7 | AI intake assistant (Anthropic, streaming, gather-only) | `intake` | ✅ |
| 8 | Consultation structured form + advisor prep view | `applicants` (consultation records) | ✅ |
| 9 | Program selection: propose → approve → confirm | `program-selection` | ✅ |
| 10 | Documents: upload, storage abstraction, verification | `documents`, `storage` | ✅ |
| 11 | Finance: invoices, payments, forwards, balances | `finance` | ✅ |
| 12 | Moodle provisioning (gated on finance) | `moodle` | ✅ |
| 13 | Student portal + staff pipeline board | `apps/web` | ✅ |
| 14 | Read-only: grades + completion read-back from Moodle | `moodle` | ✅ |

## Integrations

- **Moodle** (`https://lms.skyline-as.ae`, 5.1.1) — web-services REST via no-login
  user `skyline-sync` / role `skyline_ws`. Catalog import (categories→unis/programs,
  courses→courses) and provisioning (create user + enrol) are idempotent. Read-back
  fetches grades + completion independently. Token in `.env` as `MOODLE_WS_TOKEN`.
  See deployment notes for the `role_allow_assign` gotcha.
- **Zoom** — auto-creates meeting links on booking confirmation.
- **Anthropic** — streaming AI intake assistant (gather-only; creates/links applicant).
- **Email** — booking confirmations + reminder job.

## Prisma migrations (`packages/db/prisma/migrations`)

`20260606162414_init` · `_stage_transitions` · `_booking_partial_unique_slot` ·
`_course_enrollments` · `_moodle_category_mapping`.

> Migrations gotcha: `prisma migrate dev` has no TTY on the server. Write the SQL
> into a new migration dir, apply with `psql`, then `prisma migrate resolve --applied`.

## Data snapshot (2026-06-07)

6 universities · 9 programs · 6 courses · 2 applicants · 2 advisors · 2 consultations ·
5 course enrollments · 4 invoices · 3 payments · 21 stage transitions.

## Backups

- **SIS** (this app): `scripts/backup-sis.sh` (or `/backup`) → timestamped
  `/root/skyline-backups/<ts>-sis/` with `sis-db.dump` (pg_dump -Fc),
  `sis-db.sql.gz`, `sis.env`, pm2 config, git HEAD, manifest + checksums.
  Keeps last 14. Restore: `pg_restore -d skyline_sis --no-owner --clean --if-exists sis-db.dump`.
- **Moodle LMS** snapshots live in the same `/root/skyline-backups/<ts>/` tree
  (separate routine — db + moodledata + theme/app).
- Not yet automated — run manually or wire into cron.

## Known gotchas

- `DATABASE_URL` has a Prisma-only `?schema=public` suffix that libpq rejects;
  strip the query string before `pg_dump`/`psql` (the backup script does this).
- pm2 can inject a stale empty env var that wins over `.env`. After editing `.env`:
  `pm2 delete skyline-api skyline-web && pm2 start ecosystem.config.js && pm2 save`
  — `restart --update-env` is not enough.

## Next / open

- Automate SIS + Moodle backups (cron) instead of manual runs.
- Student-portal polish and staff pipeline-board UX iterations as feedback comes in.
