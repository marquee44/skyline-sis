import { Module } from '@nestjs/common';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';
import { AuthModule } from '../auth/auth.module';
import { ApplicantsModule } from '../applicants/applicants.module';

@Module({
  imports: [AuthModule, ApplicantsModule],
  controllers: [BookingController],
  providers: [BookingService],
})
export class BookingModule {}
