-- AlterTable
ALTER TABLE "advisors" ADD COLUMN     "public_booking" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "applicants" ADD COLUMN     "lead_source" TEXT;

