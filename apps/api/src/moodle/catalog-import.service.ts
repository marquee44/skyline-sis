import { Injectable, Logger } from '@nestjs/common';
import { ProgramLevel } from '@skyline/db';
import { PrismaService } from '../prisma/prisma.service';
import { MoodleService, MoodleCategory, MoodleCourse } from './moodle.service';

export interface ImportSummary {
  universities: number;
  programs: number;
  courses: number;
  skipped: string[];
}

/**
 * Import the Moodle course tree into the SIS catalog and keep it mappable:
 *   top-level category  → University
 *   sub-category        → Program (under its ancestor university)
 *   course              → Course (under its category's program, moodle_course_id set)
 *
 * Idempotent: universities/programs are matched by moodle_category_id, courses by
 * moodle_course_id, so re-running updates names rather than duplicating. SIS stays
 * the system of record — staff refine tuition/levels/names afterwards.
 */
@Injectable()
export class CatalogImportService {
  private readonly logger = new Logger(CatalogImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly moodle: MoodleService,
  ) {}

  // Browse-only passthroughs for the UI.
  browseCategories() {
    return this.moodle.getCategories();
  }
  browseCourses() {
    return this.moodle.getCourses();
  }

  async import(): Promise<ImportSummary> {
    const [categories, courses] = await Promise.all([
      this.moodle.getCategories(),
      this.moodle.getCourses(),
    ]);

    const byId = new Map<number, MoodleCategory>(categories.map((c) => [c.id, c]));
    const topLevelAncestor = (cat: MoodleCategory): MoodleCategory => {
      let cur = cat;
      while (cur.parent && byId.has(cur.parent)) cur = byId.get(cur.parent)!;
      return cur;
    };

    const summary: ImportSummary = { universities: 0, programs: 0, courses: 0, skipped: [] };

    // 1) Top-level categories → universities.
    const uniIdByCat = new Map<number, string>();
    for (const cat of categories.filter((c) => c.parent === 0)) {
      const uni = await this.prisma.university.upsert({
        where: { moodleCategoryId: cat.id },
        update: { name: cat.name },
        create: {
          name: cat.name,
          shortName: cat.name.slice(0, 12),
          country: 'RS',
          moodleCategoryId: cat.id,
        },
      });
      uniIdByCat.set(cat.id, uni.id);
      summary.universities++;
    }

    // 2) Sub-categories → programs (under their ancestor university).
    const programIdByCat = new Map<number, string>();
    for (const cat of categories.filter((c) => c.parent !== 0)) {
      const top = topLevelAncestor(cat);
      const universityId = uniIdByCat.get(top.id);
      if (!universityId) {
        summary.skipped.push(`category ${cat.id} (${cat.name}): no university`);
        continue;
      }
      const program = await this.prisma.program.upsert({
        where: { moodleCategoryId: cat.id },
        update: { name: cat.name },
        create: {
          universityId,
          name: cat.name,
          level: ProgramLevel.professional, // default; staff adjust
          tuitionTotal: 0,
          tuitionCurrency: 'AED',
          moodleCategoryId: cat.id,
        },
      });
      programIdByCat.set(cat.id, program.id);
      summary.programs++;
    }

    // 3) Ensure each university has a "General" program for courses placed
    //    directly under a top-level category.
    const generalProgramByUniCat = new Map<number, string>();
    const ensureGeneral = async (uniCatId: number): Promise<string | null> => {
      if (generalProgramByUniCat.has(uniCatId)) return generalProgramByUniCat.get(uniCatId)!;
      const universityId = uniIdByCat.get(uniCatId);
      if (!universityId) return null;
      const existing = await this.prisma.program.findFirst({
        where: { universityId, name: 'General', moodleCategoryId: null },
      });
      const program =
        existing ??
        (await this.prisma.program.create({
          data: { universityId, name: 'General', level: ProgramLevel.professional, tuitionTotal: 0 },
        }));
      generalProgramByUniCat.set(uniCatId, program.id);
      return program.id;
    };

    // 4) Courses → SIS courses.
    for (const course of courses) {
      const programId =
        programIdByCat.get(course.categoryid) ??
        (uniIdByCat.has(course.categoryid) ? await ensureGeneral(course.categoryid) : null);
      if (!programId) {
        summary.skipped.push(`course ${course.id} (${course.fullname}): no program for category ${course.categoryid}`);
        continue;
      }
      await this.upsertCourse(programId, course);
      summary.courses++;
    }

    this.logger.log(
      `Moodle import: ${summary.universities} universities, ${summary.programs} programs, ${summary.courses} courses, ${summary.skipped.length} skipped`,
    );
    return summary;
  }

  private async upsertCourse(programId: string, course: MoodleCourse) {
    const existing = await this.prisma.course.findFirst({ where: { moodleCourseId: course.id } });
    if (existing) {
      return this.prisma.course.update({
        where: { id: existing.id },
        data: { name: course.fullname, programId },
      });
    }
    return this.prisma.course.create({
      data: { programId, name: course.fullname, moodleCourseId: course.id },
    });
  }
}
