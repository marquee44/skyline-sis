import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ProposeDto {
  @IsString()
  programId!: string;
}

export class DecisionDto {
  @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}
