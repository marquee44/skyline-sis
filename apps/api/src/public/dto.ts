import { IsArray, IsEmail, IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class QuestionnaireDto {
  @IsString() @MaxLength(80)
  consultationId!: string;

  @IsOptional() @IsArray()
  answers?: { q: string; a: string }[];
}

export class PublicBookDto {
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

  @IsOptional() @IsString() @MaxLength(150)
  programInterest?: string;

  @IsISO8601()
  scheduledStartUtc!: string;

  @IsString() @MaxLength(60)
  studentTimezone!: string;

  @IsOptional() @IsString()
  turnstileToken?: string;
}
