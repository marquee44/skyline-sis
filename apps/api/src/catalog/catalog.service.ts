import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@skyline/db';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCourseDto,
  CreateProgramDto,
  CreateUniversityDto,
  UpdateCourseDto,
  UpdateProgramDto,
  UpdateTermDto,
  UpdateUniversityDto,
} from './dto';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Universities ──────────────────────────────────────────────────────────
  listUniversities() {
    return this.prisma.university.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { programs: true } } },
    });
  }

  async getUniversity(id: string) {
    const u = await this.prisma.university.findUnique({
      where: { id },
      include: { programs: { orderBy: { name: 'asc' } } },
    });
    if (!u) throw new NotFoundException('University not found');
    return u;
  }

  createUniversity(dto: CreateUniversityDto) {
    return this.prisma.university.create({ data: dto });
  }

  async updateUniversity(id: string, dto: UpdateUniversityDto) {
    await this.getUniversity(id);
    return this.prisma.university.update({ where: { id }, data: dto });
  }

  async removeUniversity(id: string) {
    await this.getUniversity(id);
    try {
      return await this.prisma.university.delete({ where: { id } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
        throw new BadRequestException('University has programs; remove them first');
      }
      throw e;
    }
  }

  // ── Programs ──────────────────────────────────────────────────────────────
  listPrograms(universityId?: string) {
    return this.prisma.program.findMany({
      where: universityId ? { universityId } : undefined,
      orderBy: [{ universityId: 'asc' }, { name: 'asc' }],
      include: {
        university: { select: { id: true, name: true, shortName: true } },
        _count: { select: { courses: true } },
      },
    });
  }

  async getProgram(id: string) {
    const p = await this.prisma.program.findUnique({
      where: { id },
      include: {
        university: true,
        courses: { orderBy: { sequence: 'asc' } },
      },
    });
    if (!p) throw new NotFoundException('Program not found');
    return p;
  }

  async createProgram(dto: CreateProgramDto) {
    const uni = await this.prisma.university.findUnique({ where: { id: dto.universityId } });
    if (!uni) throw new BadRequestException('universityId does not exist');
    return this.prisma.program.create({
      data: {
        universityId: dto.universityId,
        name: dto.name,
        level: dto.level,
        ects: dto.ects ?? null,
        durationMonths: dto.durationMonths ?? null,
        tuitionTotal: new Prisma.Decimal(dto.tuitionTotal),
        tuitionCurrency: dto.tuitionCurrency ?? 'AED',
        active: dto.active ?? true,
      },
    });
  }

  async updateProgram(id: string, dto: UpdateProgramDto) {
    await this.getProgram(id);
    const data: Prisma.ProgramUpdateInput = {
      name: dto.name,
      level: dto.level,
      ects: dto.ects,
      durationMonths: dto.durationMonths,
      tuitionCurrency: dto.tuitionCurrency,
      active: dto.active,
    };
    if (dto.tuitionTotal !== undefined) data.tuitionTotal = new Prisma.Decimal(dto.tuitionTotal);
    return this.prisma.program.update({ where: { id }, data });
  }

  async removeProgram(id: string) {
    await this.getProgram(id);
    // Deleting a program DB-cascades to terms→courses→enrolments — which would
    // silently wipe student records (and bypass the audit hook). Block it.
    const [te, ce] = await Promise.all([
      this.prisma.termEnrollment.count({ where: { term: { programId: id } } }),
      this.prisma.courseEnrollment.count({ where: { course: { programId: id } } }),
    ]);
    if (te + ce > 0) {
      throw new BadRequestException(
        'Cannot delete a program with student enrolments — they would be wiped. Withdraw/clear the enrolments first.',
      );
    }
    return this.prisma.program.delete({ where: { id } });
  }

  // ── Courses ───────────────────────────────────────────────────────────────
  listCourses(programId?: string) {
    return this.prisma.course.findMany({
      where: programId ? { programId } : undefined,
      orderBy: [{ programId: 'asc' }, { sequence: 'asc' }],
      include: {
        program: { select: { id: true, name: true } },
        term: { select: { id: true, name: true, sequence: true } },
        instructors: { include: { teacher: { select: { firstName: true, lastName: true } } } },
      },
    });
  }

  async createCourse(dto: CreateCourseDto) {
    const program = await this.prisma.program.findUnique({ where: { id: dto.programId } });
    if (!program) throw new BadRequestException('programId does not exist');
    return this.prisma.course.create({
      data: {
        programId: dto.programId,
        name: dto.name,
        moodleCourseId: dto.moodleCourseId ?? null,
        sequence: dto.sequence ?? 0,
      },
    });
  }

  async updateCourse(id: string, dto: UpdateCourseDto) {
    const c = await this.prisma.course.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Course not found');
    return this.prisma.course.update({ where: { id }, data: dto });
  }

  async removeCourse(id: string) {
    const c = await this.prisma.course.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Course not found');
    const ce = await this.prisma.courseEnrollment.count({ where: { courseId: id } });
    if (ce > 0) {
      throw new BadRequestException('Cannot delete a course with student enrolments — they would be wiped.');
    }
    return this.prisma.course.delete({ where: { id } });
  }

  // ── Terms (semesters) ───────────────────────────────────────────────────────
  listTerms(programId: string) {
    return this.prisma.term.findMany({
      where: { programId },
      orderBy: { sequence: 'asc' },
      include: { _count: { select: { courses: true } } },
    });
  }

  async updateTerm(id: string, dto: UpdateTermDto) {
    const t = await this.prisma.term.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Term not found');
    return this.prisma.term.update({ where: { id }, data: dto });
  }
}
