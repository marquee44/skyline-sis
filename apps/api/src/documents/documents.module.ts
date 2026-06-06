import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { AuthModule } from '../auth/auth.module';
import { ApplicantsModule } from '../applicants/applicants.module';

@Module({
  imports: [AuthModule, ApplicantsModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
})
export class DocumentsModule {}
