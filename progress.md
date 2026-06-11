# Skyline SIS — Progress

_Last updated: 2026-06-11 · HEAD `e44c6fe` · deployed at https://sis.skyline-as.ae_

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

## Beyond the base build (2026-06-08 → 06-11)

See [`docs/roadmap.md`](docs/roadmap.md) for status of every item. Shipped since the
14 increments:

- **Multi-semester model** — `University → Program → Term → Course`; per-term
  invoice → pay → enrol with sequence gating; degree audit + auto-graduation.
  See [`docs/multi-semester-model.md`](docs/multi-semester-model.md).
- **Student self-service portal** (`/portal`) — students log in (staff create the
  login) to see their stage, semesters, fees, documents, grades; `/me/*` API.
- **Admin command-center dashboard** (`/dashboard`, staff landing) — KPIs, money
  (collected/outstanding/forwarded = margin), pipeline funnel, **next-semester
  renewal forecast**, revenue-by-program donut, at-risk list.
- **Finance reports** (`/reports`) — revenue by program/semester, who-owes, CSV.
- **At-risk flags** — owes / stalled >14d / paid-but-not-in-Moodle, on the Students
  dashboard + dashboard.
- **Scholarships / discounts** — per-student `scholarshipPercent`, auto-applied to
  term invoices.
- **Transcript / grades** — per-course grades from Moodle (staff + student portal).
- **Rich applicant profile** — DOB, gender, address, prior education, **sponsor** +
  **emergency contact** (admission-services replacements for K-12 guardian); wide
  2-column detail page with a progress/courses/grades summary.
- **Moodle SSO bridge** — custom Moodle plugin `local_sislogin` (source in
  `moodle/local_sislogin/`) gives one-click login from the SIS portal into Moodle
  as the student. See [[skyline-moodle-integration]] memory.
- **Tier-0 hardening** — admin password rotated off the default + self-service
  change-password (`/account`); nightly backup cron; email wired to Resend
  (needs a key to actually send).
- **Dark UI** — shared `components/Shell.tsx` (sidebar + topbar); every staff page
  restyled dark + consistent.

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

`_init` · `_stage_transitions` · `_booking_partial_unique_slot` ·
`_course_enrollments` · `_moodle_category_mapping` · `_add_terms_term_enrollments` ·
`_applicant_scholarship` · `_applicant_profile_fields`. All **additive** since the
multi-semester rework.

> Migrations gotcha: `prisma migrate dev` has no TTY on the server. Generate SQL via
> `prisma migrate diff --from-schema-datasource … --to-schema-datamodel … --script`,
> apply with `psql`, then `prisma migrate resolve --applied`.

## Data snapshot (2026-06-11, after catalog reset to live Moodle)

1 university (Skyline University) · 3 programs (Psihologija 62c/8sem, Okupaciona
terapija 2c/8sem, Socijalni rad 5c/1sem) · 69 courses · 3 advisors · **0 applicants**
(all test students cleared in the reset; real applicants added from here).

## Backups

- **SIS** (this app): `scripts/backup-sis.sh` (or `/backup`) → timestamped
  `/root/skyline-backups/<ts>-sis/` with `sis-db.dump` (pg_dump -Fc),
  `sis-db.sql.gz`, `sis.env`, pm2 config, git HEAD, manifest + checksums. Keeps last 14.
  Restore: `pg_restore -d skyline_sis --no-owner --clean --if-exists sis-db.dump`.
- **Automated:** nightly cron `15 2 * * *` runs the script → `/var/log/skyline-backup.log`.
- **Moodle LMS** snapshots live in the same `/root/skyline-backups/<ts>/` tree.

## Known gotchas (see the `skyline-deployment` / `skyline-moodle-integration` memories)

- **nginx caches the app HTML** (global `proxy_cache cache_one` + Next's `s-maxage`),
  serving stale/blank pages after a deploy. Fixed with `proxy_cache off;` in the SIS
  vhost; if it recurs, purge `/www/server/nginx/proxy_cache_dir/*` + `nginx -s reload`.
- **Dark form controls:** `color-scheme: light dark` made native inputs/selects render
  white; `.app-shell` CSS in `globals.css` + `[color-scheme:dark]` force them dark.
- **Moodle is 5.1 with the `public/` web-root layout** (dirroot = `…/moodlecode/public`,
  CLI at `moodlecode/admin/cli`, PHP 8.2 `php-fpm-82`). After installing a Moodle plugin,
  `systemctl reload php-fpm-82` or WS calls fail with "Cannot find file /externallib.php".
- `DATABASE_URL` has a Prisma-only `?schema=public` suffix libpq rejects — strip it.
- pm2 can inject a stale empty env var. After editing `.env`:
  `pm2 delete skyline-api skyline-web && pm2 start ecosystem.config.js && pm2 save`.

## Next / open (no-credential vs blocked)

- **Needs your accounts:** activate email (Resend key + domain), online payments
  (gateway), SMS/WhatsApp, accounting sync, full Authentik OIDC SSO.
- **Needs Moodle admin:** attendance read-back (Attendance plugin + WS function).
- **Buildable now:** sponsor/employer billing (sponsor field is in place), per-program
  course counts in the program list, set real semester fees, multilingual UI, retire
  the legacy flat-billing path.
