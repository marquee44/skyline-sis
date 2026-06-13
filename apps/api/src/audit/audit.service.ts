import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter: { entity?: string; entityId?: string; limit?: number }) {
    const where: { entity?: string; entityId?: string } = {};
    if (filter.entity) where.entity = filter.entity;
    if (filter.entityId) where.entityId = filter.entityId;
    const take = Math.min(Math.max(filter.limit ?? 50, 1), 200);

    const rows = await this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take });
    const ids = [...new Set(rows.map((r) => r.actorUserId).filter((x): x is string => !!x))];
    const users = ids.length
      ? await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true } })
      : [];
    const emap = new Map(users.map((u) => [u.id, u.email]));
    return rows.map((r) => ({ ...r, actorEmail: r.actorUserId ? emap.get(r.actorUserId) ?? null : null }));
  }
}
