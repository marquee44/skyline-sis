import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import PgBoss from 'pg-boss';

/**
 * Background jobs run on pg-boss — a queue that lives inside Postgres, so there
 * is no Redis to operate. Feature modules register handlers via work()/schedule()
 * in their own onModuleInit; this service just owns the boss lifecycle and gates
 * every call on a `started` promise so registration order doesn't matter.
 */
@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobsService.name);
  private boss?: PgBoss;
  private readonly started: Promise<void>;
  private markStarted!: () => void;

  constructor() {
    this.started = new Promise((resolve) => {
      this.markStarted = resolve;
    });
  }

  async onModuleInit() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      this.logger.warn('DATABASE_URL not set — job queue disabled');
      this.markStarted();
      return;
    }
    this.boss = new PgBoss({
      connectionString,
      schema: process.env.PGBOSS_SCHEMA ?? 'pgboss',
    });
    this.boss.on('error', (err) => this.logger.error('pg-boss error', err));
    await this.boss.start();
    this.markStarted();
    this.logger.log('pg-boss started (job queue ready)');
  }

  async onModuleDestroy() {
    await this.boss?.stop({ graceful: true });
  }

  async createQueue(name: string): Promise<void> {
    await this.started;
    if (!this.boss) return;
    try {
      await this.boss.createQueue(name);
    } catch {
      /* already exists — fine */
    }
  }

  async work<T extends object>(
    name: string,
    handler: (job: PgBoss.Job<T>) => Promise<void>,
  ): Promise<void> {
    await this.started;
    if (!this.boss) return;
    // pg-boss v10 delivers a batch; unwrap to per-job for callers.
    await this.boss.work<T>(name, async (jobs) => {
      for (const job of ([] as PgBoss.Job<T>[]).concat(jobs as never)) {
        await handler(job);
      }
    });
  }

  async schedule(name: string, cron: string, data: object = {}): Promise<void> {
    await this.started;
    if (!this.boss) return;
    await this.boss.schedule(name, cron, data as never);
  }

  async enqueue<T extends object>(name: string, data: T): Promise<string | null> {
    await this.started;
    if (!this.boss) throw new Error('Job queue not started');
    return this.boss.send(name, data);
  }
}
