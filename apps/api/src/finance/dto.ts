import {
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { PaymentMethod } from '@skyline/db';

export class CreateInvoiceDto {
  @IsString()
  applicantId!: string;

  // Defaults to the applicant's chosen program if omitted.
  @IsOptional() @IsString()
  programId?: string;

  // Defaults to the program's tuition_total if omitted.
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  amountTotal?: number;

  @IsOptional() @IsString() @MaxLength(8)
  currency?: string;

  @IsOptional() @IsISO8601()
  dueAt?: string;
}

export class CreatePaymentDto {
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01)
  amount!: number;

  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @IsOptional() @IsString() @MaxLength(120)
  reference?: string;
}

export class CreateForwardDto {
  @IsString()
  universityId!: string;

  @IsString()
  applicantId!: string;

  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01)
  amount!: number;

  @IsOptional() @IsString() @MaxLength(8)
  currency?: string;

  @IsOptional() @IsString() @MaxLength(120)
  reference?: string;

  @IsOptional() @IsString() @MaxLength(500)
  notes?: string;
}
