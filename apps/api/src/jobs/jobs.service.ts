import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import PgBoss from 'pg-boss';

/**
 * Background jobs run on pg-boss — a queue that lives inside Postgres, so there
 * is no Redis to operate. Later increments register handlers here:
 *   - booking reminder emails (spec section 5)
 *   - Moodle provisioning, gated on finance status (spec sections 9 & 12)
 */
@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobsService.name);
  private boss?: PgBoss;

  async onModuleInit() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      this.logger.warn('DATABASE_URL not set — job queue disabled');
      return;
    }
    this.boss = new PgBoss({
      connectionString,
      schema: process.env.PGBOSS_SCHEMA ?? 'pgboss',
    });
    this.boss.on('error', (err) => this.logger.error('pg-boss error', err));
    await this.boss.start();
    this.logger.log('pg-boss started (job queue ready)');
  }

  async onModuleDestroy() {
    await this.boss?.stop({ graceful: true });
  }

  /** Enqueue a job by name. Handlers are wired in their feature modules. */
  async enqueue<T extends object>(queue: string, data: T): Promise<string | null> {
    if (!this.boss) throw new Error('Job queue not started');
    return this.boss.send(queue, data);
  }

  get instance(): PgBoss | undefined {
    return this.boss;
  }
}
