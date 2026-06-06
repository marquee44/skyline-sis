# Skyline SIS

Admissions + enrollment pipeline for Skyline University Admission Services.
Build brief: [`skyline-sis-spec-v2.md`](skyline-sis-spec-v2.md).

Deployed at **https://sis.skyline-as.ae** (replaces the previous Gibbon install).

## Stack

- **Monorepo:** pnpm workspaces — `apps/api`, `apps/web`, `packages/db`.
- **API:** NestJS (TypeScript), served under `/api`.
- **Web:** Next.js (thin UI over the API).
- **DB:** PostgreSQL (native on the server) + Prisma.
- **Jobs:** pg-boss (queue inside Postgres — no Redis).
- **Auth:** Passport JWT + role guards (`student` / `staff` / `admin`).
- **Process mgr:** pm2 (`api` + `web`).
- **Edge:** nginx reverse proxy (existing Let's Encrypt cert) → Next on :3000, `/api` → NestJS on :3001.

## Local dev

```bash
pnpm install
pnpm db:generate          # prisma client
pnpm db:migrate           # apply migrations to skyline_sis
pnpm --filter @skyline/db seed
pnpm dev                  # api (:3001) + web (:3000)
```

Open http://localhost:3000 — the landing page shows API + DB status.

## Environment

Copy `.env.example` → `.env`. `DATABASE_URL` points at the native Postgres
(`skyline_sis`). Integration keys (Anthropic, Zoom, Moodle, email) are filled in
later increments.

## Build order

Following section 11 of the spec. Increment 1 (this) = scaffold: monorepo, full
Prisma schema (section 8), migrations, auth/jobs plumbing, both apps booting.
