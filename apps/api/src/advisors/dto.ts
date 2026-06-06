import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateAdvisorDto {
  @IsString() @MinLength(2) @MaxLength(150)
  name!: string;

  @IsEmail()
  email!: string;

  @IsOptional() @IsBoolean()
  active?: boolean;
}

export class UpdateAdvisorDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(150)
  name?: string;

  @IsOptional() @IsEmail()
  email?: string;

  @IsOptional() @IsBoolean()
  active?: boolean;
}

export class CreateAvailabilityRuleDto {
  // 0 = Sunday … 6 = Saturday
  @IsInt() @Min(0) @Max(6)
  weekday!: number;

  @Matches(HHMM, { message: 'startTime must be HH:mm' })
  startTime!: string;

  @Matches(HHMM, { message: 'endTime must be HH:mm' })
  endTime!: string;

  @IsInt() @Min(5) @Max(480)
  slotMinutes!: number;

  // IANA timezone name, e.g. "Asia/Dubai"
  @IsString()
  timezone!: string;
}

export class UpdateAvailabilityRuleDto {
  @IsOptional() @IsInt() @Min(0) @Max(6)
  weekday?: number;

  @IsOptional() @Matches(HHMM, { message: 'startTime must be HH:mm' })
  startTime?: string;

  @IsOptional() @Matches(HHMM, { message: 'endTime must be HH:mm' })
  endTime?: string;

  @IsOptional() @IsInt() @Min(5) @Max(480)
  slotMinutes?: number;

  @IsOptional() @IsString()
  timezone?: string;
}
