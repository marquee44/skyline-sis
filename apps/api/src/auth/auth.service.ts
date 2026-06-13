import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { UserRole } from '@skyline/db';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { JwtPayload } from './roles';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly notifications: NotificationsService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Compare even when the user is missing to avoid leaking which emails exist.
    const hash = user?.passwordHash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinv';
    const ok = await bcrypt.compare(password, hash);
    if (!user || !ok) throw new UnauthorizedException('Invalid credentials');

    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role, applicantId: user.applicantId };
    return {
      accessToken: await this.jwt.signAsync(payload),
      user: { id: user.id, email: user.email, role: user.role, applicantId: user.applicantId },
    };
  }

  /**
   * Create (or reset) a student login for an applicant and return a one-time
   * temporary password for the staff member to hand over. Admin/staff action.
   */
  async createStudentLogin(applicantId: string) {
    const applicant = await this.prisma.applicant.findUnique({ where: { id: applicantId } });
    if (!applicant) throw new BadRequestException('Applicant not found');
    const tempPassword = randomBytes(12).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 14);
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ applicantId }, { email: applicant.email }] },
    });
    if (existing && existing.applicantId && existing.applicantId !== applicantId) {
      throw new BadRequestException('That email already belongs to another account');
    }
    if (existing) {
      await this.prisma.user.update({
        where: { id: existing.id },
        data: { passwordHash, applicantId, role: UserRole.student },
      });
    } else {
      await this.prisma.user.create({
        data: { email: applicant.email, passwordHash, role: UserRole.student, applicantId },
      });
    }
    void this.notifications.studentLoginCreated(applicant, tempPassword);
    return { email: applicant.email, tempPassword };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Not authenticated');
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) throw new BadRequestException('Current password is incorrect');
    if (newPassword === currentPassword) throw new BadRequestException('New password must be different');
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    return { ok: true };
  }
}
