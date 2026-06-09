import { Injectable, Logger } from '@nestjs/common';
import { ProgramLevel } from '@skyline/db';
import { PrismaService } from '../prisma/prisma.service';
import { MoodleService, MoodleCategory, MoodleCourse } from './moodle.service';

export interface ImportSummary {
  universities: number;
  programs: number;
  terms: number;
  courses: number;
  skipped: string[];
}

// A Moodle category is a semester/term when its name says so.
const TERM_RE = /semestar|semester/i;
const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 };
// Fallback university when Moodle has no university level (its tops are Bachelor/Master).
const DEFAULT_UNIVERSITY_NAME = 'Skyline University';

/** Order of a term from its name: "III semestar" → 3, "Semester 2" → 2. */
function termSequence(name: string): number {
  const roman = name.trim().match(/^([ivx]+)\b/i);
  if (roman && ROMAN[roman[1].toLowerCase()]) return ROMAN[roman[1].toLowerCase()];
  const digits = name.match(/\d+/);
  return digits ? parseInt(digits[0], 10) : 0;
}

/** Map a category name to a program level, or null if it isn't a level keyword. */
function levelFromName(name: string): ProgramLevel | null {
  const n = name.toLowerCase();
  if (/\bmba\b/.test(n)) return ProgramLevel.MBA;
  if (/master|magistar|\bma\b|\bmsc\b/.test(n)) return ProgramLevel.MA;
  if (/phd|doctor|doktor/.test(n)) return ProgramLevel.PhD;
  if (/bachelor|osnovne|\bba\b|\bbsc\b|undergrad/.test(n)) return ProgramLevel.BA;
  return null;
}

/**
 * Import the Moodle course tree into the SIS catalog as University → Program →
 * Term → Course (multi-semester model). Detection:
 *   - a category named "… semestar/semester"  → Term (holds the courses)
 *   - the term's parent category               → Program (the degree a student applies to)
 *   - the nearest Bachelor/Master/… ancestor   → the program's level
 *   - the top-level ancestor                    → University, unless that top level is
 *     itself a level keyword (Bachelor/Master), in which case a single default
 *     university is used (Moodle has no university level here).
 *
 * Idempotent: universities/programs/terms matched by moodle_category_id, courses by
 * moodle_course_id. Re-running updates names and re-points courses rather than
 * duplicating. Course.programId is kept in sync alongside Course.termId.
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
    const ancestors = (cat: MoodleCategory): MoodleCategory[] => {
      const chain: MoodleCategory[] = [];
      let cur = cat;
      while (cur.parent && byId.has(cur.parent)) {
        cur = byId.get(cur.parent)!;
        chain.push(cur);
      }
      return chain; // immediate parent first … top-level last
    };

    const summary: ImportSummary = { universities: 0, programs: 0, terms: 0, courses: 0, skipped: [] };

    // 0) A single default university for programs whose Moodle tree has no
    //    university level (their top is Bachelor/Master). Created lazily.
    let defaultUniversityId: string | null = null;
    const ensureDefaultUniversity = async (): Promise<string> => {
      if (defaultUniversityId) return defaultUniversityId;
      const existing = await this.prisma.university.findFirst({ where: { name: DEFAULT_UNIVERSITY_NAME } });
      const uni =
        existing ??
        (await this.prisma.university.create({
          data: { name: DEFAULT_UNIVERSITY_NAME, shortName: 'Skyline', country: 'RS' },
        }));
      defaultUniversityId = uni.id;
      if (!existing) summary.universities++;
      return uni.id;
    };

    // 1) Real top-level universities (top-level categories that are NOT level keywords).
    const uniIdByCat = new Map<number, string>();
    for (const cat of categories.filter((c) => c.parent === 0 && !levelFromName(c.name))) {
      const uni = await this.prisma.university.upsert({
        where: { moodleCategoryId: cat.id },
        update: { name: cat.name },
        create: { name: cat.name, shortName: cat.name.slice(0, 12), country: 'RS', moodleCategoryId: cat.id },
      });
      uniIdByCat.set(cat.id, uni.id);
      summary.universities++;
    }

    // 2) Terms drive program + term creation. Walk every semester category.
    const programIdByCat = new Map<number, string>(); // degree category → program id
    const termIdByCat = new Map<number, string>(); // semester category → term id
    const termProgramByCat = new Map<number, string>(); // semester category → its program id

    const resolveProgram = async (programCat: MoodleCategory): Promise<string> => {
      if (programIdByCat.has(programCat.id)) return programIdByCat.get(programCat.id)!;
      const chain = ancestors(programCat);
      const top = chain.length ? chain[chain.length - 1] : programCat;
      const level =
        chain.map((c) => levelFromName(c.name)).find((l): l is ProgramLevel => l != null) ??
        levelFromName(programCat.name) ??
        ProgramLevel.professional;
      const universityId = uniIdByCat.get(top.id) ?? (await ensureDefaultUniversity());
      const program = await this.prisma.program.upsert({
        where: { moodleCategoryId: programCat.id },
        update: { name: programCat.name, level, universityId },
        create: { universityId, name: programCat.name, level, tuitionTotal: 0, tuitionCurrency: 'AED', moodleCategoryId: programCat.id },
      });
      programIdByCat.set(programCat.id, program.id);
      summary.programs++;
      return program.id;
    };

    for (const term of categories.filter((c) => TERM_RE.test(c.name))) {
      const programCat = byId.get(term.parent);
      if (!programCat) {
        summary.skipped.push(`term ${term.id} (${term.name}): no parent program category`);
        continue;
      }
      const programId = await resolveProgram(programCat);
      const t = await this.prisma.term.upsert({
        where: { moodleCategoryId: term.id },
        update: { name: term.name, sequence: termSequence(term.name), programId },
        create: { programId, name: term.name, sequence: termSequence(term.name), tuitionTotal: 0, tuitionCurrency: 'AED', moodleCategoryId: term.id },
      });
      termIdByCat.set(term.id, t.id);
      termProgramByCat.set(term.id, programId);
      summary.terms++;
    }

    // 3) Courses → under their term (and that term's program). Courses sitting
    //    directly under a degree (no semester) get a "General" term of that program.
    const generalTermByProgram = new Map<string, string>();
    const ensureGeneralTerm = async (programId: string): Promise<string> => {
      if (generalTermByProgram.has(programId)) return generalTermByProgram.get(programId)!;
      const existing = await this.prisma.term.findFirst({ where: { programId, name: 'General', moodleCategoryId: null } });
      const t = existing ?? (await this.prisma.term.create({ data: { programId, name: 'General', sequence: 0, tuitionTotal: 0 } }));
      generalTermByProgram.set(programId, t.id);
      if (!existing) summary.terms++;
      return t.id;
    };

    for (const course of courses) {
      let termId = termIdByCat.get(course.categoryid) ?? null;
      let programId = termProgramByCat.get(course.categoryid) ?? null;
      if (!programId && programIdByCat.has(course.categoryid)) {
        // Course directly under a degree category (no semester).
        programId = programIdByCat.get(course.categoryid)!;
        termId = await ensureGeneralTerm(programId);
      }
      if (!programId || !termId) {
        summary.skipped.push(`course ${course.id} (${course.fullname}): category ${course.categoryid} not under a degree/term`);
        continue;
      }
      await this.upsertCourse(programId, termId, course);
      summary.courses++;
    }

    this.logger.log(
      `Moodle import: ${summary.universities} universities, ${summary.programs} programs, ${summary.terms} terms, ${summary.courses} courses, ${summary.skipped.length} skipped`,
    );
    return summary;
  }

  private async upsertCourse(programId: string, termId: string, course: MoodleCourse) {
    const existing = await this.prisma.course.findFirst({ where: { moodleCourseId: course.id } });
    if (existing) {
      return this.prisma.course.update({
        where: { id: existing.id },
        data: { name: course.fullname, programId, termId },
      });
    }
    return this.prisma.course.create({
      data: { programId, termId, name: course.fullname, moodleCourseId: course.id },
    });
  }
}
