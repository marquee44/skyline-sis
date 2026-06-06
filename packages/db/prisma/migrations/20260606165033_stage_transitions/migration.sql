-- CreateTable
CREATE TABLE "stage_transitions" (
    "id" TEXT NOT NULL,
    "applicant_id" TEXT NOT NULL,
    "from_stage" "ApplicantStage",
    "to_stage" "ApplicantStage" NOT NULL,
    "note" TEXT,
    "by_user_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stage_transitions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stage_transitions_applicant_id_created_at_idx" ON "stage_transitions"("applicant_id", "created_at");

-- AddForeignKey
ALTER TABLE "stage_transitions" ADD CONSTRAINT "stage_transitions_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "applicants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
