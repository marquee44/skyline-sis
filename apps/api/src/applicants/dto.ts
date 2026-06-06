import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
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
}

export class TransitionStageDto {
  @IsEnum(ApplicantStage)
  toStage!: ApplicantStage;

  @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}
