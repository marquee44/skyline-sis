-- University ← Moodle top-level category
ALTER TABLE "universities" ADD COLUMN "moodle_category_id" INTEGER;
CREATE UNIQUE INDEX "universities_moodle_category_id_key" ON "universities"("moodle_category_id");

-- Program ← Moodle sub-category
ALTER TABLE "programs" ADD COLUMN "moodle_category_id" INTEGER;
CREATE UNIQUE INDEX "programs_moodle_category_id_key" ON "programs"("moodle_category_id");
