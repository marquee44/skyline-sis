import { Module } from '@nestjs/common';
import { ProgramSelectionController } from './program-selection.controller';
import { ProgramSelectionService } from './program-selection.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [ProgramSelectionController],
  providers: [ProgramSelectionService],
  exports: [ProgramSelectionService],
})
export class ProgramSelectionModule {}
