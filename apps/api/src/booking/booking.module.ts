import { Module } from '@nestjs/common';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';
import { BookingRemindersService } from './reminders.service';
import { AuthModule } from '../auth/auth.module';
import { ApplicantsModule } from '../applicants/applicants.module';
// Public self-service booking lives INSIDE this module (not a separate module that
// imports it) — a cross-module import of a worker-owning module deadlocks app boot.
import { PublicController } from '../public/public.controller';
import { PublicBookingService } from '../public/public-booking.service';
import { QuestionnaireService } from '../public/questionnaire.service';

@Module({
  imports: [AuthModule, ApplicantsModule],
  controllers: [BookingController, PublicController],
  providers: [BookingService, BookingRemindersService, PublicBookingService, QuestionnaireService],
  exports: [BookingService],
})
export class BookingModule {}
