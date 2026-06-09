import { Module } from '@nestjs/common';
import { MoodleController } from './moodle.controller';
import { MoodleCatalogController } from './moodle-catalog.controller';
import { StudentTranscriptController } from './student-transcript.controller';
import { MoodleService } from './moodle.service';
import { ProvisioningService } from './provisioning.service';
import { MoodleReadbackService } from './readback.service';
import { CatalogImportService } from './catalog-import.service';
import { AuthModule } from '../auth/auth.module';
import { ApplicantsModule } from '../applicants/applicants.module';

@Module({
  imports: [AuthModule, ApplicantsModule],
  controllers: [MoodleController, MoodleCatalogController, StudentTranscriptController],
  providers: [MoodleService, ProvisioningService, MoodleReadbackService, CatalogImportService],
})
export class MoodleModule {}
