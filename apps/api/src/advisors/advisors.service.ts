import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@skyline/db';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateAdvisorDto,
  CreateAvailabilityRuleDto,
  UpdateAdvisorDto,
  UpdateAvailabilityRuleDto,
} from './dto';
import { hhmmToMinutes, isValidTimezone } from '../common/time';

@Injectable()
export class AdvisorsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.advisor.findMany({
      orderBy: { name: 'asc' },
      include: { availabilityRules: { orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }] } },
    });
  }

  async get(id: string) {
    const a = await this.prisma.advisor.findUnique({
      where: { id },
      include: { availabilityRules: { orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }] } },
    });
    if (!a) throw new NotFoundException('Advisor not found');
    return a;
  }

  async create(dto: CreateAdvisorDto) {
    try {
      return await this.prisma.advisor.create({ data: dto });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('An advisor with that email already exists');
      }
      throw e;
    }
  }

  async update(id: string, dto: UpdateAdvisorDto) {
    await this.get(id);
    // Only one advisor can be the shared public calendar — unset any other first.
    if (dto.publicBooking === true) {
      await this.prisma.advisor.updateMany({
        where: { id: { not: id }, publicBooking: true },
        data: { publicBooking: false },
      });
    }
    return this.prisma.advisor.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.get(id);
    try {
      return await this.prisma.advisor.delete({ where: { id } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
        throw new BadRequestException('Advisor has consultations/applicants; cannot delete');
      }
      throw e;
    }
  }

  // ── Availability rules ──────────────────────────────────────────────────────
  private validateRule(r: {
    startTime?: string;
    endTime?: string;
    timezone?: string;
  }) {
    if (r.timezone && !isValidTimezone(r.timezone)) {
      throw new BadRequestException(`Invalid IANA timezone: ${r.timezone}`);
    }
    if (r.startTime && r.endTime && hhmmToMinutes(r.endTime) <= hhmmToMinutes(r.startTime)) {
      throw new BadRequestException('endTime must be after startTime');
    }
  }

  async addRule(advisorId: string, dto: CreateAvailabilityRuleDto) {
    await this.get(advisorId);
    this.validateRule(dto);
    if (hhmmToMinutes(dto.endTime) - hhmmToMinutes(dto.startTime) < dto.slotMinutes) {
      throw new BadRequestException('Window is shorter than one slot');
    }
    return this.prisma.availabilityRule.create({ data: { advisorId, ...dto } });
  }

  async updateRule(advisorId: string, ruleId: string, dto: UpdateAvailabilityRuleDto) {
    const rule = await this.prisma.availabilityRule.findFirst({ where: { id: ruleId, advisorId } });
    if (!rule) throw new NotFoundException('Availability rule not found');
    const merged = { ...rule, ...dto };
    this.validateRule(merged);
    return this.prisma.availabilityRule.update({ where: { id: ruleId }, data: dto });
  }

  async removeRule(advisorId: string, ruleId: string) {
    const rule = await this.prisma.availabilityRule.findFirst({ where: { id: ruleId, advisorId } });
    if (!rule) throw new NotFoundException('Availability rule not found');
    return this.prisma.availabilityRule.delete({ where: { id: ruleId } });
  }
}
