# Skyline SIS — Roadmap

_Last updated 2026-06-09. Companion to [progress.md](../progress.md) (what's done) and
[multi-semester-model.md](multi-semester-model.md) (the per-term design)._

Skyline is an **admissions + enrollment + finance + Moodle-provisioning** system, not a
full school SIS. Teaching (course delivery, attendance entry, grade entry) stays in
**Moodle**, where faculty work; the SIS owns the **administrative record** (enrollment,
money, documents, official academic record, compliance) and **reads** operational data
back from Moodle. Items below respect that boundary — anything that belongs to Moodle or
the partner universities is deliberately excluded.

Effort key: **S** ≈ hours, **M** ≈ a few days, **L** ≈ 1–2 weeks.

---

## Tier 0 — Pre-launch hardening ✅ DONE (2026-06-09)

- **Admin password** — ✅ rotated off the public default; added self-service change-password
  (`POST /auth/change-password` + `/account` page). New password stored in `.env`.
- **Automated backups** — ✅ nightly cron `15 2 * * *` runs `scripts/backup-sis.sh`
  (→ `/var/log/skyline-backup.log`). Verified under a clean shell.
- **Email delivery** — ✅ code wired to Resend HTTP API (was a stub that silently logged).
  ⚠️ NOT yet active: needs `EMAIL_API_KEY` (Resend `re_…`) + `EMAIL_FROM` (verified sender
  domain via DNS). Until set, it's safe log-only and warns. **Action on you:** create a
  Resend account, verify the domain, set both env vars.

## Tier 1 — Highest user value

- **Student portal (self-service)** — ✅ v1 DONE (2026-06-09). Staff create a login
  (`POST /auth/students/:id/login` → temp password; button on the applicant page). Students
  sign in → `/portal`, scoped to their own record via `applicantId` in the JWT and the
  `/me/overview` endpoint: stage, semesters (status/fee/paid), balance, documents, Moodle
  deep-link. Verified students can't reach staff endpoints (403). **Remaining:** online
  pay (needs the gateway below) + grades/transcript view (Tier 2).
- **Online payment gateway + receipts** — integrate a UAE-friendly gateway (Telr / Network
  International / Stripe). Student pays a term online → payment auto-recorded → PDF receipt.
  Closes the finance loop (today payments are keyed by hand). Pairs with the portal. **(M–L)**
- **Communications: SMS / WhatsApp + announcements** — beyond transactional email: dunning
  reminders for unpaid/locked terms, "next semester open" notices, broadcast announcements.
  WhatsApp Business API or Twilio. **(M)**

## Tier 2 — Complete the academic loop (extends the Moodle read-back)

- **Attendance read-back from Moodle** — faculty mark attendance in Moodle (its Attendance
  activity); the SIS pulls it for **UAE visa compliance**, at-risk flags, and progression.
  Don't build attendance *entry* in the SIS. **(M, needs Moodle Attendance + a WS function)**
- **Degree audit / graduation tracking** — ✅ DONE (2026-06-09). `degreeAudit(applicantId)`
  → semesters completed/remaining, %, current/next term, graduation-eligible. Exposed at
  `GET /applicants/:id/degree-audit` (staff), in `/me/overview` (student portal "My
  progress" bar), and a progress line on the staff Semesters panel. Auto-advances the
  applicant to `graduated` when every program term is enrolled. Verified E2E.
- **Transcript / academic record** — ✅ DONE (2026-06-09). `readback.transcript()` →
  per-course grade + completion. Staff: `GET /applicants/:id/moodle/transcript`; student:
  `GET /me/transcript` + printable `/portal/transcript` page (Print/Save-PDF). Wired via a
  controller INSIDE MoodleModule (a separate module importing MoodleModule deadlocks boot —
  see deployment notes). Grades show "—" until faculty grade the course in Moodle.

## Tier 3 — Business operations & finance depth

- **Financial aid / scholarships / discounts** — ✅ DONE (2026-06-09). Per-student
  `scholarshipPercent` (+ note) set via the applicant page; auto-applied to every term
  invoice (`invoiceTerm` bills fee − %). Term rows + portal show gross struck-through + net.
  Verified: 20% → a 5000 semester is invoiced 4000.
- **Admin command-center dashboard** — ✅ DONE (2026-06-09). Dark-themed `/dashboard`
  (staff landing): KPI cards (active/pipeline/new+trend/collected+trend/outstanding/
  conversion), money (collected vs outstanding vs forwarded = margin), pipeline funnel,
  revenue-by-program donut (SVG, no chart dep), **next-semester renewal forecast**,
  upcoming consultations, recent payments, and the at-risk list. `GET /dashboard`.

- **Custom reports / analytics** — ✅ PARTLY DONE (2026-06-09). `/reports` page:
  revenue by program + by semester + outstanding balances, each CSV-exportable
  (`GET /reports/finance`). Plus an at-risk "Needs attention" card on the Students
  dashboard (`GET /reports/at-risk`: owes / stalled >14d / paid-but-not-in-Moodle).
  Still possible later: admissions funnel chart, forwards-owed report, PDF export.
- **Accounting integration (QuickBooks / Zoho Books)** — sync invoices, payments, and
  university forwards to the books instead of re-keying. Relevant because real money moves. **(M–L)**

## Also shipped (2026-06-09 → 06-11)

- **Rich applicant profile** — ✅ DONE. DOB, gender, address, prior education, sponsor +
  emergency contact (admission-services replacements for K-12 guardian); wide 2-column
  detail page with a progress / courses-&-grades / balance summary strip.
- **Dark UI redesign** — ✅ DONE. Shared `components/Shell.tsx` (sidebar + topbar); all
  staff pages restyled dark + consistent; `.app-shell` CSS forces dark native form controls.
- **Moodle SSO bridge (interim)** — ✅ DONE. Custom `local_sislogin` Moodle plugin →
  one-click login from the SIS portal into Moodle as the student. (Full Authentik OIDC is
  the durable version — below.)
- **Catalog reset to live Moodle data** — ✅ DONE (2026-06-11). Wiped catalog + test data,
  re-imported from Moodle; Courses view grouped Program → Semester → Course.

## Tier 4 — Polish, reach, scale

- **Multilingual UI (English / Arabic / Serbian)** — fits the UAE base + Serbian partner
  content; matters most for the student portal. **(M)**
- **Full Authentik OIDC SSO** — one login for SIS + Moodle, both directions (the interim
  bridge only covers SIS → Moodle). Moodle 5.1 core `auth/oauth2` makes this the clean path. **(M–L)**
- **Mobile / PWA** — installable, offline-friendly; students especially. **(M)**
- **New-term automation** — auto-issue the next semester's invoice when it opens + dunning
  schedule; builds on per-term billing. **(M)**

## Tier 5 — Technical debt / cleanup (no user-facing change)

- **Retire the legacy flat billing path** — now that per-term billing works, make
  `Course.termId` / `Invoice.termId` required, drop `Program.tuitionTotal`, and remove the
  old whole-program invoice + provision buttons. **(S–M)**
- **Test data** — ✅ cleared in the 2026-06-11 catalog reset (0 applicants now).
- **Set real semester fees** — fresh Moodle import leaves term fees at 0; set per program
  in the catalog "semesters & fees" editor. **(S)**

---

## Recommended sequence
1. **Tier 0** (a day total) — don't go live without it.
2. **Student portal → online payments → SMS/WhatsApp dunning** (Tier 1) — the product-defining arc.
3. **Degree audit + transcript + attendance** (Tier 2) — completes the academic record.
4. **Scholarships, reporting, accounting** (Tier 3) as the operation scales.
5. **Tier 4/5** opportunistically.

## Deliberately out of scope (Moodle's or the university's job — don't build)
Course content & delivery, in-SIS timetabling/rooms, gradebook *entry*, attendance *entry*,
lesson plans, standards-based grading, behavior/discipline, medical records, parent &
teacher portals.
