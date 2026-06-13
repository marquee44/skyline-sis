-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "reminder_sent_at" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "reminder_sent_at" TIMESTAMPTZ(6);

