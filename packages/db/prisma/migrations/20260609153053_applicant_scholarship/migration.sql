-- AlterTable
ALTER TABLE "applicants" ADD COLUMN     "scholarship_note" TEXT,
ADD COLUMN     "scholarship_percent" DECIMAL(5,2) NOT NULL DEFAULT 0;

