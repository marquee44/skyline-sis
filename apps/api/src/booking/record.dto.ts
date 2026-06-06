import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Eligibility } from '@skyline/db';

// The structured consultation outcome the advisor fills in (spec section 6).
export class ConsultationRecordDto {
  @IsOptional() @IsString() @MaxLength(500)
  goal?: string;

  @IsOptional() @IsString() @MaxLength(200)
  priorEducationLevel?: string;

  @IsOptional() @IsString() @MaxLength(200)
  priorEducationField?: string;

  @IsOptional() @IsInt() @Min(0) @Max(80)
  yearsExperience?: number;

  @IsOptional() @IsString() @MaxLength(200)
  fitProgramArea?: string;

  @IsOptional() @IsEnum(Eligibility)
  eligibility?: Eligibility;

  @IsOptional() @IsString()
  recommendedProgramId?: string;

  @IsOptional() @IsString() @MaxLength(50)
  recommendedLevel?: string;

  @IsOptional() @IsString()
  notes?: string;
}
