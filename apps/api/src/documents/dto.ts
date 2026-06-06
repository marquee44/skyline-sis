import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { DocumentType, DocumentStatus } from '@skyline/db';

export class CreateDocumentDto {
  @IsString()
  applicantId!: string;

  @IsEnum(DocumentType)
  type!: DocumentType;

  @IsOptional() @IsString() @MaxLength(500)
  notes?: string;
}

export class VerifyDocumentDto {
  @IsEnum(DocumentStatus)
  status!: DocumentStatus; // verified | rejected (or back to required)

  @IsOptional() @IsString() @MaxLength(500)
  notes?: string;
}
