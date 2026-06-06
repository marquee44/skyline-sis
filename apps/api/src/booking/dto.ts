import { IsISO8601, IsOptional, IsString, Matches } from 'class-validator';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class SlotsQueryDto {
  @Matches(ISO_DATE, { message: 'from must be YYYY-MM-DD' })
  from!: string;

  @Matches(ISO_DATE, { message: 'to must be YYYY-MM-DD' })
  to!: string;
}

export class CreateBookingDto {
  @IsString()
  applicantId!: string;

  @IsString()
  advisorId!: string;

  // UTC instant of the slot start (ISO 8601).
  @IsISO8601()
  scheduledStartUtc!: string;

  // IANA timezone the student booked in (for display/emails).
  @IsString()
  studentTimezone!: string;
}

export class RescheduleDto {
  @IsISO8601()
  scheduledStartUtc!: string;

  @IsOptional() @IsString()
  studentTimezone?: string;
}
