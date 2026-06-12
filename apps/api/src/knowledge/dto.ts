import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateKnowledgeDto {
  @IsString() @MinLength(1) @MaxLength(300)
  question!: string;

  @IsString() @MinLength(1) @MaxLength(4000)
  answer!: string;

  @IsOptional() @IsString() @MaxLength(60)
  category?: string;

  @IsOptional() @IsBoolean()
  active?: boolean;

  @IsOptional() @IsInt()
  sortOrder?: number;
}

export class UpdateKnowledgeDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(300)
  question?: string;

  @IsOptional() @IsString() @MinLength(1) @MaxLength(4000)
  answer?: string;

  @IsOptional() @IsString() @MaxLength(60)
  category?: string;

  @IsOptional() @IsBoolean()
  active?: boolean;

  @IsOptional() @IsInt()
  sortOrder?: number;
}
