-- DropIndex
DROP INDEX "consultations_advisor_id_scheduled_start_utc_key";

-- CreateIndex
CREATE INDEX "consultations_advisor_id_scheduled_start_utc_idx" ON "consultations"("advisor_id", "scheduled_start_utc");

-- Atomic reservation: a slot can be held by at most one ACTIVE booking.
-- Cancelled / no-show consultations keep their row but free the slot.
CREATE UNIQUE INDEX "consultations_active_slot_unique"
  ON "consultations"("advisor_id", "scheduled_start_utc")
  WHERE status IN ('booked', 'completed');
