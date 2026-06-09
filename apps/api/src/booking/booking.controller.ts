import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ConsultationStatus } from '@skyline/db';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles } from '../auth/roles';
import { BookingService } from './booking.service';
import { CreateBookingDto, RescheduleDto, SlotsQueryDto } from './dto';
import { ConsultationRecordDto } from './record.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('staff', 'admin')
@Controller()
export class BookingController {
  constructor(private readonly booking: BookingService) {}

  // Available slots for an advisor in a date range (YYYY-MM-DD).
  @Get('advisors/:id/slots')
  slots(@Param('id') id: string, @Query() q: SlotsQueryDto) {
    return this.booking.availableSlots(id, q.from, q.to);
  }

  @Get('consultations')
  list(
    @Query('advisorId') advisorId?: string,
    @Query('applicantId') applicantId?: string,
    @Query('status') status?: ConsultationStatus,
  ) {
    return this.booking.list({ advisorId, applicantId, status });
  }

  @Get('consultations/:id')
  get(@Param('id') id: string) {
    return this.booking.get(id);
  }

  @Post('consultations')
  book(@Body() dto: CreateBookingDto, @Req() req: { user?: { id: string } }) {
    return this.booking.book(dto, req.user?.id);
  }

  // TEST-ONLY (admin): fabricate a completed consultation so an admin can drive
  // the pipeline without an advisor/booking. Advances stage → consultation_completed.
  @Post('applicants/:id/test-consultation')
  @Roles('admin')
  testConsultation(@Param('id') id: string, @Req() req: { user?: { id: string } }) {
    return this.booking.testCompleteConsultation(id, req.user?.id);
  }

  @Patch('consultations/:id/reschedule')
  reschedule(@Param('id') id: string, @Body() dto: RescheduleDto) {
    return this.booking.reschedule(id, dto);
  }

  @Post('consultations/:id/cancel')
  cancel(@Param('id') id: string) {
    return this.booking.cancel(id);
  }

  // Advisor prep view (intake answers + any record).
  @Get('consultations/:id/prep')
  prep(@Param('id') id: string) {
    return this.booking.prep(id);
  }

  // Save the structured consultation outcome → marks completed + advances stage.
  @Post('consultations/:id/record')
  saveRecord(
    @Param('id') id: string,
    @Body() dto: ConsultationRecordDto,
    @Req() req: { user?: { id: string } },
  ) {
    return this.booking.saveRecord(id, dto, req.user?.id);
  }
}
