import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MoodleService } from './moodle.service';

const TEACHER_ROLES = new Set(['editingteacher', 'teacher']);

@Injectable()
export class TeachersService {
  private readonly logger = new Logger(TeachersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly moodle: MoodleService,
  ) {}

  /** Pull instructors from each Moodle-linked course and (re)build the teacher map. */
  async importFromMoodle() {
    const courses = await this.prisma.course.findMany({
      where: { moodleCourseId: { not: null } },
      select: { id: true, moodleCourseId: true },
    });
    const seen = new Set<number>();
    let links = 0;
    let errors = 0;

    for (const c of courses) {
      let users;
      try {
        users = await this.moodle.enrolledUsers(c.moodleCourseId!);
      } catch (e) {
        errors++;
        this.logger.warn(`enrolledUsers(${c.moodleCourseId}) failed: ${(e as Error).message}`);
        continue;
      }
      const teachers = users.filter((u) => (u.roles ?? []).some((r) => TEACHER_ROLES.has(r.shortname)));

      // Rebuild this course's instructor links so removed teachers drop off.
      await this.prisma.courseInstructor.deleteMany({ where: { courseId: c.id } });
      for (const u of teachers) {
        const t = await this.prisma.teacher.upsert({
          where: { moodleUserId: u.id },
          update: { firstName: u.firstname, lastName: u.lastname, email: u.email ?? null },
          create: { moodleUserId: u.id, firstName: u.firstname, lastName: u.lastname, email: u.email ?? null },
        });
        const role = (u.roles ?? []).find((r) => TEACHER_ROLES.has(r.shortname))?.shortname ?? null;
        await this.prisma.courseInstructor.create({ data: { courseId: c.id, teacherId: t.id, role } });
        seen.add(u.id);
        links++;
      }
    }

    // Drop teachers who no longer instruct any course.
    await this.prisma.teacher.deleteMany({ where: { courses: { none: {} } } });

    return { teachers: seen.size, links, coursesScanned: courses.length, errors };
  }

  async list() {
    const teachers = await this.prisma.teacher.findMany({
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      include: {
        courses: {
          include: { course: { select: { name: true, program: { select: { name: true, level: true } } } } },
        },
      },
    });
    return teachers.map((t) => ({
      id: t.id,
      moodleUserId: t.moodleUserId,
      name: `${t.firstName} ${t.lastName}`.trim(),
      email: t.email,
      courseCount: t.courses.length,
      courses: t.courses.map((ci) => ({
        name: ci.course.name,
        program: ci.course.program?.name ?? null,
        level: ci.course.program?.level ?? null,
        role: ci.role,
      })),
    }));
  }
}
