# Skyline SIS — Build Specification v2

A student admissions + enrollment pipeline for **Skyline University Admission
Services**. It takes a Balkan professional living in the UAE from a first AI-guided
intake conversation, through a human advisory consultation, into enrollment as a
student in a central Moodle — and tracks their program, documents, and tuition
throughout.

This document is the build brief to hand to Claude Code. Build it in the
increments in section 11 — small, working slices, not one giant pass.

---

## 1. What this system is (and is not)

Skyline is an **admissions bridge**. Teaching, exams, grading, and diploma
issuance are done by partner universities/faculties in Serbia. Skyline runs **ONE
central Moodle** for all students and is the **system of record** for
applications, the advisory process, documents, and finances. Tuition is **paid to
Skyline**, which forwards it to the relevant university.

The SIS does these things:

1. **AI intake** — a gather-only assistant that collects interests + basic info, then hands off to booking.
2. **Native booking** — schedules the human consultation, with timezone handling and auto-created Zoom links.
3. **Advisory support** — preps the advisor and records a structured consultation outcome.
4. **Program selection** — student proposes → advisor approves → student confirms.
5. **Documents** — collected after the consultation, stored securely.
6. **Finance** — invoices, payments in, forwards out to universities.
7. **Moodle provisioning** — creates the student account and enrolls them in their program's courses when finance allows.

**Explicitly OUT of scope:** teaching, exams, grading, attendance, the gradebook,
the student's academic progress view, diploma issuance — **all of that is Moodle
and the universities.** Teachers are Moodle-only and are not users of the SIS.

### The division of systems (important)

- **Moodle** owns everything academic. Students study, take exams, submit papers, and see their grades/progress there. Teachers set exams and grade there. One central instance, controlled by Skyline.
- **The SIS** owns everything about getting-in and paying: intake, booking, advisory, program choice, documents, finance, and pushing students into Moodle.
- **Students** use both (two logins): Moodle for studying, the SIS portal for status/documents/finance.
- **Teachers** use Moodle only.
- **Skyline staff (advisors/admins)** use the SIS, and touch Moodle only for occasional setup.

Rule of thumb: **anything academic happens in Moodle; anything about getting-in
and paying happens in the SIS.**

---

## 2. Tech stack

All TypeScript, end to end.

- **Frontend:** Next.js (React) + TypeScript, **shadcn/ui** + Tailwind for components. Two areas: the public/student portal and the staff/advisor admin.
- **Backend:** NestJS + TypeScript (module-per-feature).
- **Database:** PostgreSQL with **Prisma** (typed schema + migrations).
- **Background jobs:** BullMQ (Redis) — for booking reminders and the Moodle provisioning job. (NestJS's scheduler is fine for simple cron-like tasks.)
- **AI intake:** Anthropic API via the official TypeScript SDK, with streaming responses.
- **Moodle:** Moodle Web Services REST API (typed service module).
- **Video:** Zoom API (auto-created meetings). Fallback: a pasted standing link until Zoom credentials are configured.
- **Email:** a transactional provider (Resend / Postmark / SendGrid) via its Node SDK.
- **File storage (v1):** local server directory **outside the public web root**, served only via authenticated routes, behind a small **storage-service abstraction** so swapping to S3/R2 later is a config change.

---

## 3. The end-to-end flow

```
AI intake chat (interests + info, gather-only, NO advice)
        │  saves answers to applicant record
        ▼
Native booking calendar (timezone-correct, atomic, confirmation email)
        │  auto-creates a Zoom meeting, stores link
        ▼
Human consultation (advisor, pre-briefed by intake answers)
        │  advisor fills structured consultation form
        ▼
Program selection:  student proposes → advisor approves → student confirms
        │  (no invoice until confirmed)
        ▼
Documents uploaded (passport/ID, diploma, transcript, …) → staff verify
        ▼
Finance: invoice issued → payment(s) received by Skyline
        │  (Moodle gated on finance status)
        ▼
Moodle provisioning: create user + enroll in program's courses
        ▼
Active student (studies & sees grades in Moodle)
        ▼
Graduated: SIS reads completion/grades from Moodle (read-only) → export for university → diploma + UAE legalization support
```

---

## 4. The AI intake assistant

A conversational front door, powered by the Anthropic API (streaming, so it feels
alive). Its **only** job is to gather and guide, then present the booking calendar.

**Collects:** what the person is interested in studying, basic info (name, email,
phone, country of origin, city in the UAE, a short description of prior education).
**Does NOT collect budget** (skipped for v1 — comes up naturally in the human call).

**Hard boundaries (enforced in the bot's system prompt):** the bot must NOT assess
eligibility, quote prices, recommend a specific program as a decision, or make any
recognition/accreditation promises. It gathers, reassures, and books. All actual
guidance is the human advisor's job. A gather-only bot is easy to keep on the rails
because it isn't trying to advise in the first place.

**Output:** the captured answers are saved to a new (or matched) `applicant`
record and shown to the advisor before the consultation.

**Privacy:** whatever the bot collects is personal data — show a brief privacy
notice at the start of the chat (see section 10).

---

## 5. Native booking (full, in v1)

Per-advisor scheduling built into the SIS.

- **Availability:** start with a fixed weekly pattern per advisor (e.g. Mon–Fri, set hours, fixed slot length). One-off blocks/holidays can come later.
- **Timezones:** store everything in **UTC**; display slots in the student's timezone (they're in the UAE, UTC+4; advisors may differ). This is the part that silently breaks if ignored — build it in from the start.
- **Atomic reservation:** booking a slot must check-and-reserve in a single transaction / via a unique constraint so two students can't grab the same slot.
- **Confirmation email** on booking; **reminder email** before the call (BullMQ scheduled job).
- **Reschedule / cancel:** student can release and re-pick a slot.
- **Zoom:** on confirmation, auto-create a Zoom meeting and store the join link on the consultation; include it in the confirmation email. Requires a Zoom app + OAuth setup (one-time). Until configured, fall back to a pasted standing meeting link.

---

## 6. Advisory support

The advisory is a **human conversation** (Zoom). The SIS wraps it:

- **Before:** advisor opens the applicant and sees the intake answers (interests, prior education, info) to prep.
- **After:** advisor fills a **structured consultation form** + free-text notes:
  - stated goal (career advancement / formal qualification / other)
  - prior education level and field
  - years of work experience
  - program area that fits
  - eligibility assessment (eligible / needs-review / not-eligible-for-X)
  - recommended program + level
  - free-text notes (catches anything the fields don't)

This records the advisor's judgment and drives the next stage. The SIS supports
the advisory; it never performs it.

---

## 7. Program selection (propose → approve → confirm)

Student has agency; advisor is the gate; there's an explicit confirmation on record.

States: `none → proposed → approved → rejected → confirmed`

1. After the consultation, the student **proposes** a program (from the full active catalog for v1; an advisor-set shortlist can come later if rejections become a nuisance).
2. The advisor **approves** it, or **rejects** with a note (e.g. "let's reconsider the MA").
3. On approval, the student gives a final **confirmation** ("yes, enroll me in this").
4. Only when status is `confirmed` can an invoice be issued.

---

## 8. Data model (Prisma schema, conceptual)

Keep it lean. Core tables:

### advisors
- id, name, email, active
- (everything is per-advisor from day one even if you run with one advisor)

### availability_rules
- id, advisor_id → advisors
- weekday, start_time, end_time, slot_minutes, timezone

### universities (partner faculties)
- id, name, short_name, country (default "RS"), notes

### programs
- id, university_id → universities
- name, level (enum: BA, MA, MBA, PhD, professional)
- ects (nullable), duration_months (nullable)
- tuition_total (decimal), tuition_currency (e.g. "AED")
- active

### courses
- id, program_id → programs
- name, moodle_course_id (int, nullable), sequence

### applicants
- id, first_name, last_name, email (unique), phone
- country_of_origin, residence_city, prior_education (text)
- interests (text — from intake bot)
- stage (enum, see section 9)
- assigned_advisor_id → advisors (nullable)
- proposed_program_id → programs (nullable)
- program_choice_status (enum: none, proposed, approved, rejected, confirmed)
- chosen_program_id → programs (nullable; set only when confirmed)
- proposed_at, approved_at, confirmed_at (nullable)
- choice_advisor_note (text, nullable)
- moodle_user_id (int, nullable)
- created_at, updated_at

### consultations
- id, applicant_id → applicants, advisor_id → advisors
- scheduled_start_utc, scheduled_end_utc, student_timezone
- status (enum: booked, completed, cancelled, no_show)
- zoom_join_url (nullable)
- reminder_sent_at (nullable)

### consultation_records (the structured form)
- id, consultation_id → consultations
- goal, prior_education_level, prior_education_field
- years_experience (int)
- fit_program_area
- eligibility (enum: eligible, needs_review, not_eligible)
- recommended_program_id → programs (nullable)
- recommended_level
- notes (text)

### documents
- id, applicant_id → applicants
- type (enum: passport, emirates_id, prior_diploma, transcript, photo, legalization, other)
- status (enum: required, uploaded, verified, rejected)
- file_path (nullable), notes
- (uploads open only AFTER the consultation)

### invoices
- id, applicant_id → applicants, program_id → programs
- amount_total (decimal), currency (default "AED")
- status (enum: draft, issued, partially_paid, paid, cancelled)
- issued_at, due_at

### payments (money IN: student → Skyline)
- id, invoice_id → invoices
- amount, method (enum: bank_transfer, card, cash, other)
- received_at, reference

### forwards (money OUT: Skyline → university)
- id, university_id → universities, applicant_id → applicants
- amount, currency (may differ from invoice — e.g. RSD/EUR)
- forwarded_at, reference, notes

Separating `payments` (in) from `forwards` (out) lets you see, per student and per
university, what you've collected vs. what you still owe.

---

## 9. Pipeline stages

A single `stage` enum on the applicant, driven as a state machine with guard
conditions and side effects:

1. `intake_started` — began the AI chat
2. `consultation_booked`
3. `consultation_completed` — advisor filled the consultation record
4. `program_proposed` / `program_approved` / `program_confirmed` (mirrors program_choice_status)
5. `documents_pending` → `documents_verified`
6. `invoice_issued` → `payment_received`
7. `enrolled` — provisioned in Moodle
8. `active_student`
9. `graduated`
10. `withdrawn` / `rejected` (terminal)

**Key business rule:** Moodle provisioning (→ `enrolled`) fires only when the
invoice is `paid` or `partially_paid` past an agreed threshold. This single rule
ties admissions, finance, and Moodle together.

---

## 10. Privacy & data protection

The system handles identity documents for people in the UAE and transfers data to
Serbia — a cross-border flow involving sensitive data. This shapes the build:

- **Storage (v1, on server):** files live **outside the public web root**, served only through authenticated routes, never via a guessable/public URL. Use a storage-service abstraction so moving to a private object store (with a deliberately chosen region) later is a config change. Ensure the document directory is included in backups and the disk is encrypted if the host offers it.
- **Collect late:** sensitive documents are requested **after** the consultation, not at registration — so you don't accumulate passports for people who never proceed.
- **Notices & consent:** a privacy notice at intake start and at registration; explicit consent to transfer data to the partner university in Serbia.
- **Retention:** define and enforce a retention period (e.g. delete non-enrolled applicants' documents after X months) and support deletion requests.
- **Action item (before go-live):** a short consultation with someone who knows **UAE PDPL** and the **Serbia/EU (GDPR-aligned)** side. This is not legal advice; given the cross-border identity-document flow, get it checked properly.

---

## 11. Build order (increments for Claude Code)

Each should be a working, testable slice.

1. Project scaffold: NestJS API + Next.js app + Prisma schema + Postgres + all migrations.
2. Catalog admin (staff): CRUD for universities, programs, courses. Seed with the five real faculties (section 13).
3. Applicants + the stage state machine (no integrations yet).
4. Advisors + per-advisor availability rules.
5. **Native booking:** slot generation, timezone display, atomic reservation, confirmation email. (Zoom + reminders next.)
6. Zoom auto-link creation; booking reminder job (BullMQ).
7. AI intake assistant (Anthropic SDK, streaming, gather-only) → creates/links applicant → leads into booking.
8. Consultation structured form + advisor prep view.
9. Program selection: propose → approve → confirm.
10. Documents: upload (post-consultation), storage abstraction, staff verification workflow.
11. Finance: invoices, payments, forwards, per-student/per-university balances.
12. **Moodle provisioning** job (section 12), gated on finance status.
13. Student portal polish (status, documents, finance view) + staff pipeline board.
14. Later/read-only: read grades & completion from Moodle for graduation + university export.

---

## 12. Moodle integration

One direction for provisioning: SIS → Moodle, triggered at the `enrolled` stage.
Read-back of grades (section 14 item) is later and read-only.

### Setup in Moodle (once, by an admin)
- Enable web services + the REST protocol.
- Create a dedicated web-services user (e.g. `skyline-sync`) with only the needed capabilities.
- Create an external service, add the functions below, generate a token. Store the token as a secret env var (never in code).

### Functions the token needs
- `core_user_create_users` — create the student account
- `core_user_get_users_by_field` — check if a user already exists (idempotency)
- `enrol_manual_enrol_users` — enroll into each program course (student roleid is 5 in stock Moodle — verify on your instance)
- (later, read-only) `gradereport_user_get_grade_items`, `core_completion_get_course_completion_status`

### Provisioning flow (idempotent)
1. On `enrolled`: if `moodle_user_id` is null, look up by email (`core_user_get_users_by_field`); if found store the id, else `core_user_create_users` and store the returned id.
2. For each `course` in the chosen program that has a `moodle_course_id`, call `enrol_manual_enrol_users` with the student role.
3. Record success/failure; re-running must be safe.

### Requests
`POST https://<your-moodle>/webservice/rest/server.php` with `wstoken`,
`wsfunction`, `moodlewsrestformat=json`, plus function params. Test each function
with one record by hand before wiring the job. Token is secret (env var); the SIS
calls Moodle, never the reverse; no personal data in query strings.

### Teachers
Teachers are created/assigned in Moodle by hand for v1 (rare, low volume). Later
the SIS could provision them with the same calls using the editing-teacher role
(roleid 3 in stock Moodle — verify). Not in v1.

---

## 13. Catalog seed (from skyline-as.ae)

Partner faculties / program areas to seed (confirm exact program names & levels):

- **Fakultet za sport, Univerzitet Union** — Sportski menadžment
- **Fakultet za medije i komunikacije** — Digitalne komunikacije i marketing
- **Fakultet za inženjerski menadžment** — Poslovni i industrijski menadžment
- **Akademija za hotelijerstvo, turizam i wellness** — Hotelijerstvo i turizam
- **Akademija za humani razvoj** — Psihologija i društvene nauke

Levels offered across these: BA, MA, MBA, PhD, professional.

---

## 14. Things to confirm while building

- **Currency:** invoices in AED, forwards likely in RSD/EUR — `forwards.currency` is separate from `invoices.currency`. Confirm.
- **Installment policy:** number of installments and the threshold that unlocks Moodle.
- **Course → Moodle mapping:** fill `moodle_course_id` for each course.
- **Zoom credentials:** set up the Zoom app early, or run with a pasted standing link until ready.
- **Legalization (MOFA attestation):** the `legalization` document type and a couple of graduation-side stages may need fleshing out.
- **Shortlist vs full catalog** for student program proposals — start full, add shortlist only if needed.

---

## 15. Why this shape (not a university ERP)

A full university ERP (OpenEduCat, Fedena, etc.) models a university's internal
operations — teaching, grading, registrar — most of which you'd disable, because
the teaching happens in Moodle and at the partner universities. A generic CRM
handles the pipeline but not the finance-gated Moodle provisioning or the
intake→booking→advisory flow that is the heart of this product. The real scope is
narrow and pipeline-shaped, which is why a lean custom build in your existing
TypeScript stack is the right call.
