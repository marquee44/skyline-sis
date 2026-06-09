-- CreateEnum
CREATE TYPE "TermEnrollmentStatus" AS ENUM ('pending', 'invoiced', 'paid', 'enrolled');

-- AlterTable
ALTER TABLE "courses" ADD COLUMN     "term_id" TEXT;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "term_id" TEXT;

-- CreateTable
CREATE TABLE "terms" (
    "id" TEXT NOT NULL,
    "program_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "tuition_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tuition_currency" TEXT NOT NULL DEFAULT 'AED',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "moodle_category_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "term_enrollments" (
    "id" TEXT NOT NULL,
    "applicant_id" TEXT NOT NULL,
    "term_id" TEXT NOT NULL,
    "status" "TermEnrollmentStatus" NOT NULL DEFAULT 'pending',
    "invoice_id" TEXT,
    "enrolled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "term_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "terms_moodle_category_id_key" ON "terms"("moodle_category_id");

-- CreateIndex
CREATE INDEX "terms_program_id_idx" ON "terms"("program_id");

-- CreateIndex
CREATE INDEX "term_enrollments_term_id_idx" ON "term_enrollments"("term_id");

-- CreateIndex
CREATE UNIQUE INDEX "term_enrollments_applicant_id_term_id_key" ON "term_enrollments"("applicant_id", "term_id");

-- CreateIndex
CREATE INDEX "courses_term_id_idx" ON "courses"("term_id");

-- AddForeignKey
ALTER TABLE "terms" ADD CONSTRAINT "terms_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_enrollments" ADD CONSTRAINT "term_enrollments_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "applicants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_enrollments" ADD CONSTRAINT "term_enrollments_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

