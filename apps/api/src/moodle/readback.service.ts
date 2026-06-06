import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MoodleService } from './moodle.service';

/**
 * Read-back from Moodle (spec section 14) — strictly read-only. The SIS reads
 * completion + grades for graduation handling and the partner-university export.
 * It never writes academic data; that lives in Moodle.
 */
@Injectable()
export class MoodleReadbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moodle: MoodleService,
  ) {}

  private async resolve(applicantId: string) {
    const applicant = await this.prisma.applicant.findUnique({ where: { id: applicantId } });
    if (!applicant) throw new BadRequestException('Applicant not found');
    if (!applicant.moodleUserId) throw new BadRequestException('Applicant is not provisioned in Moodle');
    if (!applicant.chosenProgramId) throw new BadRequestException('Applicant has no chosen program');
    const courses = await this.prisma.course.findMany({
      where: { programId: applicant.chosenProgramId, moodleCourseId: { not: null } },
      orderBy: { sequence: 'asc' },
    });
    return { applicant, courses };
  }

  async progress(applicantId: string) {
    const { applicant, courses } = await this.resolve(applicantId);
    // Grades and completion are fetched independently — a course with completion
    // tracking disabled still returns its grades (and vice-versa).
    const settle = async <T>(p: Promise<T>): Promise<{ data?: T; error?: string }> => {
      try {
        return { data: await p };
      } catch (e) {
        return { error: (e as Error).message };
      }
    };
    const perCourse = await Promise.all(
      courses.map(async (c) => {
        const [completion, grades] = await Promise.all([
          settle(this.moodle.courseCompletion(applicant.moodleUserId!, c.moodleCourseId!)),
          settle(this.moodle.gradeItems(applicant.moodleUserId!, c.moodleCourseId!)),
        ]);
        return {
          courseId: c.id,
          name: c.name,
          moodleCourseId: c.moodleCourseId,
          completion: completion.data ?? null,
          completionError: completion.error,
          grades: grades.data ?? null,
          gradesError: grades.error,
        };
      }),
    );
    return { applicantId, moodleUserId: applicant.moodleUserId, courses: perCourse };
  }

  async universityExport(applicantId: string) {
    const { applicant } = await this.resolve(applicantId);
    const program = await this.prisma.program.findUnique({
      where: { id: applicant.chosenProgramId! },
      include: { university: true },
    });
    const progress = await this.progress(applicantId);
    return {
      student: {
        name: `${applicant.firstName} ${applicant.lastName}`,
        email: applicant.email,
        countryOfOrigin: applicant.countryOfOrigin,
      },
      university: program?.university
        ? { name: program.university.name, country: program.university.country }
        : null,
      program: program ? { name: program.name, level: program.level } : null,
      progress: progress.courses,
      generatedFromMoodle: true,
    };
  }
}
