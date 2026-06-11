import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApplicantStage } from '@skyline/db';

export class CreateApplicantDto {
  @IsString() @MinLength(1) @MaxLength(100)
  firstName!: string;

  @IsString() @MinLength(1) @MaxLength(100)
  lastName!: string;

  @IsEmail()
  email!: string;

  @IsOptional() @IsString() @MaxLength(40)
  phone?: string;

  @IsOptional() @IsString() @MaxLength(100)
  countryOfOrigin?: string;

  @IsOptional() @IsString() @MaxLength(100)
  residenceCity?: string;

  @IsOptional() @IsString()
  priorEducation?: string;

  @IsOptional() @IsString()
  interests?: string;

  @IsOptional() @IsDateString()
  dateOfBirth?: string;

  @IsOptional() @IsString() @MaxLength(20)
  gender?: string;

  @IsOptional() @IsString() @MaxLength(200)
  addressLine?: string;

  @IsOptional() @IsString() @MaxLength(150)
  sponsorName?: string;

  @IsOptional() @IsString() @MaxLength(100)
  sponsorContact?: string;

  @IsOptional() @IsString() @MaxLength(150)
  emergencyContactName?: string;

  @IsOptional() @IsString() @MaxLength(100)
  emergencyContactPhone?: string;
}

export class UpdateApplicantDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100)
  firstName?: string;

  @IsOptional() @IsString() @MinLength(1) @MaxLength(100)
  lastName?: string;

  @IsOptional() @IsString() @MaxLength(40)
  phone?: string;

  @IsOptional() @IsString() @MaxLength(100)
  countryOfOrigin?: string;

  @IsOptional() @IsString() @MaxLength(100)
  residenceCity?: string;

  @IsOptional() @IsString()
  priorEducation?: string;

  @IsOptional() @IsString()
  interests?: string;

  @IsOptional() @IsString()
  assignedAdvisorId?: string;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100)
  scholarshipPercent?: number;

  @IsOptional() @IsString() @MaxLength(200)
  scholarshipNote?: string;

  @IsOptional() @IsDateString()
  dateOfBirth?: string;

  @IsOptional() @IsString() @MaxLength(20)
  gender?: string;

  @IsOptional() @IsString() @MaxLength(200)
  addressLine?: string;

  @IsOptional() @IsString() @MaxLength(150)
  sponsorName?: string;

  @IsOptional() @IsString() @MaxLength(100)
  sponsorContact?: string;

  @IsOptional() @IsString() @MaxLength(150)
  emergencyContactName?: string;

  @IsOptional() @IsString() @MaxLength(100)
  emergencyContactPhone?: string;
}

export class TransitionStageDto {
  @IsEnum(ApplicantStage)
  toStage!: ApplicantStage;

  @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}
