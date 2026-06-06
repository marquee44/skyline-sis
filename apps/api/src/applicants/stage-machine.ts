import { ApplicantStage, ProgramChoiceStatus } from '@skyline/db';

/**
 * The applicant pipeline as an explicit state machine (spec section 9).
 *
 * Design decision (from the build review): the three program-selection stages
 * are NOT freely settable — they mirror `program_choice_status`, which is the
 * source of truth. The program-selection endpoints (increment 9) move both in
 * lockstep. Everything else is a normal staff-driven transition.
 *
 * `withdrawn` and `rejected` are terminal and reachable from any non-terminal
 * stage (a candidate can drop out, or be rejected, at any point).
 */

const S = ApplicantStage;

// Forward transitions (excluding the universal withdraw/reject escape hatches).
const FORWARD: Record<ApplicantStage, ApplicantStage[]> = {
  [S.intake_started]: [S.consultation_booked],
  [S.consultation_booked]: [S.consultation_completed],
  [S.consultation_completed]: [S.program_proposed],
  [S.program_proposed]: [S.program_approved],
  [S.program_approved]: [S.program_confirmed],
  [S.program_confirmed]: [S.documents_pending],
  [S.documents_pending]: [S.documents_verified],
  [S.documents_verified]: [S.invoice_issued],
  [S.invoice_issued]: [S.payment_received],
  [S.payment_received]: [S.enrolled],
  [S.enrolled]: [S.active_student],
  [S.active_student]: [S.graduated],
  [S.graduated]: [],
  [S.withdrawn]: [],
  [S.rejected]: [],
};

const TERMINAL: ApplicantStage[] = [S.graduated, S.withdrawn, S.rejected];

// Stages that are derived from program_choice_status, not set directly.
const PROGRAM_DERIVED: ApplicantStage[] = [
  S.program_proposed,
  S.program_approved,
  S.program_confirmed,
];

export function isTerminal(stage: ApplicantStage): boolean {
  return TERMINAL.includes(stage);
}

/** Stages an applicant may legally move to from its current stage. */
export function allowedNextStages(current: ApplicantStage): ApplicantStage[] {
  if (isTerminal(current)) return [];
  const next = [...FORWARD[current]];
  // From any non-terminal stage you can withdraw or reject.
  next.push(S.withdrawn, S.rejected);
  return next;
}

export interface TransitionCheck {
  ok: boolean;
  reason?: string;
}

/**
 * Validate a proposed transition. `programChoiceStatus` is consulted only for
 * the program-derived stages so the two fields can never contradict each other.
 */
export function canTransition(
  from: ApplicantStage,
  to: ApplicantStage,
  ctx: { programChoiceStatus: ProgramChoiceStatus },
): TransitionCheck {
  if (from === to) return { ok: false, reason: 'Already in that stage' };
  if (!allowedNextStages(from).includes(to)) {
    return { ok: false, reason: `Illegal transition: ${from} → ${to}` };
  }

  // Program-derived stages require the matching program_choice_status, which the
  // selection flow sets. This is the guard that keeps stage and status in sync.
  if (PROGRAM_DERIVED.includes(to)) {
    const required: Record<string, ProgramChoiceStatus> = {
      [S.program_proposed]: ProgramChoiceStatus.proposed,
      [S.program_approved]: ProgramChoiceStatus.approved,
      [S.program_confirmed]: ProgramChoiceStatus.confirmed,
    };
    if (ctx.programChoiceStatus !== required[to]) {
      return {
        ok: false,
        reason: `Stage ${to} requires program_choice_status = ${required[to]} (use the program-selection flow)`,
      };
    }
  }

  return { ok: true };
}
