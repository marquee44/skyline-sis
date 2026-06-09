import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ProgramLevel } from '@skyline/db';

// ── Universities ────────────────────────────────────────────────────────────
export class CreateUniversityDto {
  @IsString() @MinLength(2) @MaxLength(200)
  name!: string;

  @IsOptional() @IsString() @MaxLength(50)
  shortName?: string;

  @IsOptional() @IsString() @MaxLength(2)
  country?: string;

  @IsOptional() @IsString()
  notes?: string;
}

export class UpdateUniversityDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200)
  name?: string;

  @IsOptional() @IsString() @MaxLength(50)
  shortName?: string;

  @IsOptional() @IsString() @MaxLength(2)
  country?: string;

  @IsOptional() @IsString()
  notes?: string;
}

// ── Programs ────────────────────────────────────────────────────────────────
export class CreateProgramDto {
  @IsString()
  universityId!: string;

  @IsString() @MinLength(2) @MaxLength(200)
  name!: string;

  @IsEnum(ProgramLevel)
  level!: ProgramLevel;

  @IsOptional() @IsInt() @Min(0)
  ects?: number;

  @IsOptional() @IsInt() @Min(0)
  durationMonths?: number;

  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  tuitionTotal!: number;

  @IsOptional() @IsString() @MaxLength(8)
  tuitionCurrency?: string;

  @IsOptional() @IsBoolean()
  active?: boolean;
}

export class UpdateProgramDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200)
  name?: string;

  @IsOptional() @IsEnum(ProgramLevel)
  level?: ProgramLevel;

  @IsOptional() @IsInt() @Min(0)
  ects?: number;

  @IsOptional() @IsInt() @Min(0)
  durationMonths?: number;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  tuitionTotal?: number;

  @IsOptional() @IsString() @MaxLength(8)
  tuitionCurrency?: string;

  @IsOptional() @IsBoolean()
  active?: boolean;
}

// ── Terms (semesters) ───────────────────────────────────────────────────────
export class UpdateTermDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200)
  name?: string;

  @IsOptional() @IsInt() @Min(0)
  sequence?: number;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  tuitionTotal?: number;

  @IsOptional() @IsString() @MaxLength(8)
  tuitionCurrency?: string;

  @IsOptional() @IsBoolean()
  active?: boolean;
}

// ── Courses ─────────────────────────────────────────────────────────────────
export class CreateCourseDto {
  @IsString()
  programId!: string;

  @IsString() @MinLength(1) @MaxLength(200)
  name!: string;

  @IsOptional() @IsInt() @Min(1)
  moodleCourseId?: number;

  @IsOptional() @IsInt() @Min(0)
  sequence?: number;
}

export class UpdateCourseDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200)
  name?: string;

  @IsOptional() @IsInt() @Min(1)
  moodleCourseId?: number;

  @IsOptional() @IsInt() @Min(0)
  sequence?: number;
}
