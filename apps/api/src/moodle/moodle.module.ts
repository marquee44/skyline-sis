import { Module } from '@nestjs/common';
import { MoodleController } from './moodle.controller';
import { MoodleService } from './moodle.service';
import { ProvisioningService } from './provisioning.service';
import { MoodleReadbackService } from './readback.service';
import { AuthModule } from '../auth/auth.module';
import { ApplicantsModule } from '../applicants/applicants.module';

@Module({
  imports: [AuthModule, ApplicantsModule],
  controllers: [MoodleController],
  providers: [MoodleService, ProvisioningService, MoodleReadbackService],
})
export class MoodleModule {}
