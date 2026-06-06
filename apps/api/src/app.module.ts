import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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

@Module({
  imports: [
    // Loads the repo-root .env (two levels up from apps/api).
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
    }),
    PrismaModule,
    HealthModule,
    JobsModule,
    AuthModule,
    EmailModule,
    ZoomModule,
    CatalogModule,
    ApplicantsModule,
    AdvisorsModule,
    BookingModule,
    IntakeModule,
  ],
})
export class AppModule {}
