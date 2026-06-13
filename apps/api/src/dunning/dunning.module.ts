import { Module } from '@nestjs/common';
import { DunningService } from './dunning.service';

@Module({
  providers: [DunningService],
})
export class DunningModule {}
