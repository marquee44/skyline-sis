# Multi-semester / multi-year model — design

_Decided 2026-06-07. Supersedes the flat `University → Program → Course` model._

## Why
Moodle's tree is 5 levels deep (academy → study type → degree → semester → courses),
but the SIS only had 3 (`University → Program → Course`). The catalog import
flattened everything into "Program", so semesters (`I semestar`) became programs
and real degrees ended up with 0 courses. Students effectively "applied to a
semester". Programs are multi-year; billing and enrolment must happen per term.

## Decisions
- **Students apply to a specific degree** (a `Program`), chosen during the
  existing consultation → program-selection flow. Not a course, not a semester.
- **Billing: per semester.** Each term carries its own fee; a student is invoiced
  and enrolled one term at a time, rolling forward across years.

## New model
```
University  (academy / faculty)
└─ Program  ← the degree a student applies to        e.g. "Socijalni rad, BA"
   └─ Term  ← "I semestar" … HAS THE FEE              e.g. 5000 AED each
      └─ Course  (mapped to Moodle, as today)
```

### Schema deltas
- **New `Term`**: `programId`, `name`, `sequence`, `tuitionTotal`,
  `tuitionCurrency`, `moodleCategoryId` (the Moodle semester category), `active`.
- **`Course`**: `programId` → **`termId`** (a course belongs to a term).
- **`Invoice`**: add **`termId`** (each invoice is for exactly one term).
- **New `TermEnrollment`**: per student × term, status
  `pending → invoiced → paid → enrolled`; links the invoice and gates Moodle.
- **`Program`**: drops its single `tuitionTotal` (price now lives on each term);
  keeps `moodleCategoryId` (the degree-level category) + metadata.

## Lifecycle (per student)
1. Apply → consultation → **pick a Program (degree)** — unchanged flow.
2. **Per term, repeating:** invoice the term's fee → payment clears threshold →
   SIS enrols the student in **that term's** Moodle courses only → next term repeats.
3. Student stays `active_student`, advancing term by term.

## Build phases (each shippable alone)
1. **Schema + migration** — ✅ DONE (2026-06-07, migration
   `…_add_terms_term_enrollments`). Added `Term`, `TermEnrollment`, nullable
   `Course.termId` and `Invoice.termId`. Additive: existing app unaffected;
   `Course.programId` retained during transition.
2. **Rework Moodle import** — ✅ DONE (2026-06-07). Live Moodle has NO idnumbers
   and tops out at Bachelor/Master (levels, not universities), so detection is by
   NAME: a category matching `semestar|semester` = Term; its parent = Program
   (degree); nearest Bachelor/Master ancestor = level (BA/MA/…); top-level used as
   University unless it's a level keyword, in which case a single default
   "Skyline University" holds the programs. Course.termId + programId set together.
   Soft cleanup run: stale flat programs deactivated (if referenced) or deleted
   (if not); empty universities removed. Active catalog = Social Work (BA, 1 term,
   5 courses) + Occupational Therapy (BA, 8 terms, term 1 = 2 courses).
3. **Per-term invoicing + provisioning** — ✅ DONE (2026-06-08). Per-term API:
   `GET /applicants/:id/terms`, `POST …/terms/:termId/invoice`,
   `POST …/moodle/terms/:termId/provision` (+ admin `-test` force). Paying a
   term invoice (it carries `term_id`) marks the `TermEnrollment` paid and
   enqueues a per-term Moodle job that enrols only that semester's courses.
   Term fees set via `PATCH /terms/:id`. UI: a "Semesters" panel on the applicant
   page (Invoice → Pay → Enrol per term). Verified E2E: a student → Social Work →
   invoice+pay I semestar → auto-enrolled in its 5 Moodle courses (Moodle user 13).
   Also fixed: Moodle username now sanitized (email `+aliases` are valid emails but
   were invalid Moodle usernames).
   KNOWN NUANCE: a student driven straight through the term flow keeps `stage =
   program_confirmed` (the linear documents/invoice stages are bypassed); the
   `TermEnrollment` status is the real per-semester truth. Phase 4 surfaces that.
   TODO later: make `termId` required + retire `Program.tuitionTotal`.
4. **Admin dashboard** — ✅ DONE. `/students` page: every student with stage,
   program, **current semester + per-term status (enrolled/paid/…) + N/total**,
   paid vs. outstanding, Moodle id. Filter by stage, search by name/email/program,
   totals row. Endpoint `GET /students/overview` (basic shipped 2026-06-07;
   semester columns added 2026-06-08).
5. **Catalog + applicant UI** — ✅ DONE. Catalog: each program has an expandable
   "semesters & fees" editor (per-term fee inline edit → `PATCH /terms/:id`).
   Applicant page: the "Semesters" panel (Invoice → Pay → Enrol per term, Phase 3).
   Remaining polish: show Program → Term → Course tree in catalog browse (cosmetic).

## Migration note
The current flattened programs (`I semestar`, `*-default`) and any test applicants
tied to them get cleaned up / re-imported during phase 2. Test data only — nothing
production-critical is built on them yet.

## Open / later
- Central finance dashboard ("all unpaid invoices") — not built today; small add.
- Re-enrolment automation when a new term opens (manual trigger first, job later).
