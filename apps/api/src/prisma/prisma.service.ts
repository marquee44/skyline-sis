import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@skyline/db';
import { currentUserId } from '../common/request-context';

// Records-bearing entities whose writes we audit. (AuditLog itself is excluded,
// so its inserts never recurse.)
const AUDITED = new Set([
  'Applicant', 'Invoice', 'Payment', 'Forward', 'Document', 'Consultation', 'ConsultationRecord',
  'TermEnrollment', 'CourseEnrollment', 'Program', 'University', 'Term', 'Course', 'Advisor', 'User', 'KnowledgeEntry',
]);
const WRITE_ACTION: Record<string, string> = {
  create: 'create', update: 'update', delete: 'delete', upsert: 'upsert',
  updateMany: 'update', deleteMany: 'delete',
};

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    this.installAuditHook();
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  private installAuditHook() {
    this.$use(async (params, next) => {
      const model = params.model;
      const action = params.action;
      if (!model || !AUDITED.has(model) || !(action in WRITE_ACTION)) return next(params);

      const delegate = (this as Record<string, any>)[model.charAt(0).toLowerCase() + model.slice(1)];
      const single = action === 'update' || action === 'delete' || action === 'upsert';
      let before: unknown = null;
      if (single && params.args?.where && delegate?.findUnique) {
        try { before = await delegate.findUnique({ where: params.args.where }); } catch { before = null; }
      }

      // Run the real write first; if it throws, propagate without logging.
      const result = await next(params);

      try {
        const bulk = action === 'updateMany' || action === 'deleteMany';
        let act = WRITE_ACTION[action];
        let after: unknown = null;
        let entityId: string | null = null;
        const rid = (result as { id?: string } | null)?.id ?? null;
        const bid = (before as { id?: string } | null)?.id ?? null;

        if (bulk) {
          after = { where: params.args?.where ?? null, count: (result as { count?: number })?.count ?? null };
        } else if (action === 'create') {
          after = result; entityId = rid;
        } else if (action === 'update') {
          after = result; entityId = rid ?? bid;
        } else if (action === 'delete') {
          entityId = bid ?? rid;
        } else if (action === 'upsert') {
          after = result; entityId = rid; act = before ? 'update' : 'create';
        }

        await this.auditLog.create({
          data: {
            entity: model,
            entityId,
            action: act,
            actorUserId: currentUserId() ?? null,
            before: this.scrub(before),
            after: this.scrub(after),
          },
        });
      } catch (e) {
        // Auditing must never break the actual operation.
        this.logger.warn(`audit log failed for ${model}.${action}: ${(e as Error).message}`);
      }
      return result;
    });
  }

  /** JSON-safe copy (coerces Decimal/Date), with secrets stripped. undefined → NULL. */
  private scrub(v: unknown): Prisma.InputJsonValue | undefined {
    if (v == null) return undefined;
    try {
      const o = JSON.parse(JSON.stringify(v));
      if (o && typeof o === 'object') {
        delete (o as Record<string, unknown>).passwordHash;
      }
      return o as Prisma.InputJsonValue;
    } catch {
      return undefined;
    }
  }
}
