import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from './roles';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Compare even when the user is missing to avoid leaking which emails exist.
    const hash = user?.passwordHash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinv';
    const ok = await bcrypt.compare(password, hash);
    if (!user || !ok) throw new UnauthorizedException('Invalid credentials');

    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    return {
      accessToken: await this.jwt.signAsync(payload),
      user: { id: user.id, email: user.email, role: user.role },
    };
  }
}
