import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuditContextInterceptor } from './common/audit-context.interceptor';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { JobsModule } from './jobs/jobs.module';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { ApplicantsModule } from './applicants/applicants.module';
import { AdvisorsModule } from './advisors/advisors.module';
import { BookingModule } from './booking/booking.module';
import { EmailModule } from './email/email.module';
import { ZoomModule } from './zoom/zoom.module';
import { IntakeModule } from './intake/intake.module';
import { StorageModule } from './storage/storage.module';
import { ProgramSelectionModule } from './program-selection/program-selection.module';
import { DocumentsModule } from './documents/documents.module';
import { FinanceModule } from './finance/finance.module';
import { MoodleModule } from './moodle/moodle.module';
import { MeModule } from './me/me.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { AuditModule } from './audit/audit.module';
import { NotificationsModule } from './notifications/notifications.module';
import { DunningModule } from './dunning/dunning.module';

@Module({
  imports: [
    // Loads the repo-root .env (two levels up from apps/api).
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    HealthModule,
    JobsModule,
    AuthModule,
    EmailModule,
    ZoomModule,
    StorageModule,
    CatalogModule,
    ApplicantsModule,
    AdvisorsModule,
    BookingModule,
    IntakeModule,
    ProgramSelectionModule,
    DocumentsModule,
    FinanceModule,
    MoodleModule,
    MeModule,
    KnowledgeModule,
    AuditModule,
    NotificationsModule,
    DunningModule,
  ],
  providers: [{ provide: APP_INTERCEPTOR, useClass: AuditContextInterceptor }],
})
export class AppModule {}
