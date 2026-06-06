import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ApplicantStage, DocumentStatus } from '@skyline/db';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ApplicantsService } from '../applicants/applicants.service';
import { CreateDocumentDto, VerifyDocumentDto } from './dto';

// Stages at/after which document collection is allowed (spec: AFTER consultation).
const POST_CONSULTATION: ApplicantStage[] = [
  ApplicantStage.consultation_completed,
  ApplicantStage.program_proposed,
  ApplicantStage.program_approved,
  ApplicantStage.program_confirmed,
  ApplicantStage.documents_pending,
  ApplicantStage.documents_verified,
  ApplicantStage.invoice_issued,
  ApplicantStage.payment_received,
  ApplicantStage.enrolled,
  ApplicantStage.active_student,
];

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly applicants: ApplicantsService,
  ) {}

  list(applicantId: string) {
    return this.prisma.document.findMany({
      where: { applicantId },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async assertCollectable(applicantId: string) {
    const applicant = await this.prisma.applicant.findUnique({ where: { id: applicantId } });
    if (!applicant) throw new BadRequestException('applicantId does not exist');
    if (!POST_CONSULTATION.includes(applicant.stage)) {
      throw new BadRequestException('Documents are collected only after the consultation');
    }
    return applicant;
  }

  // Create a required-document slot (e.g. staff requests a passport).
  async create(dto: CreateDocumentDto) {
    await this.assertCollectable(dto.applicantId);
    return this.prisma.document.create({
      data: {
        applicantId: dto.applicantId,
        type: dto.type,
        status: DocumentStatus.required,
        notes: dto.notes,
      },
    });
  }

  async upload(documentId: string, file: { originalname: string; buffer: Buffer }) {
    const doc = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!doc) throw new NotFoundException('Document not found');
    await this.assertCollectable(doc.applicantId);

    // Replace any previous file for this slot.
    if (doc.filePath) await this.storage.remove(doc.filePath).catch(() => undefined);
    const key = await this.storage.save(`applicants/${doc.applicantId}`, file.originalname, file.buffer);

    const updated = await this.prisma.document.update({
      where: { id: documentId },
      data: { filePath: key, status: DocumentStatus.uploaded },
    });
    await this.maybeAdvanceToPending(doc.applicantId);
    return updated;
  }

  async setStatus(documentId: string, dto: VerifyDocumentDto) {
    const doc = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!doc) throw new NotFoundException('Document not found');
    if (dto.status === DocumentStatus.verified && !doc.filePath) {
      throw new BadRequestException('Cannot verify a document with no uploaded file');
    }
    const updated = await this.prisma.document.update({
      where: { id: documentId },
      data: { status: dto.status, notes: dto.notes ?? doc.notes },
    });
    await this.maybeAdvanceToVerified(doc.applicantId);
    return updated;
  }

  async fileFor(documentId: string) {
    const doc = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!doc || !doc.filePath) throw new NotFoundException('No file for this document');
    return { stream: this.storage.readStream(doc.filePath), doc };
  }

  async remove(documentId: string) {
    const doc = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!doc) throw new NotFoundException('Document not found');
    if (doc.filePath) await this.storage.remove(doc.filePath).catch(() => undefined);
    return this.prisma.document.delete({ where: { id: documentId } });
  }

  // When the first document is uploaded, move the applicant into documents_pending.
  private async maybeAdvanceToPending(applicantId: string) {
    const applicant = await this.prisma.applicant.findUnique({ where: { id: applicantId } });
    if (applicant?.stage === ApplicantStage.program_confirmed) {
      await this.applicants
        .transition(applicantId, ApplicantStage.documents_pending, { note: 'documents started' })
        .catch(() => undefined);
    }
  }

  // When every document is verified (and at least one exists), advance.
  private async maybeAdvanceToVerified(applicantId: string) {
    const docs = await this.prisma.document.findMany({ where: { applicantId } });
    const relevant = docs.filter((d) => d.status !== DocumentStatus.rejected);
    const allVerified = relevant.length > 0 && relevant.every((d) => d.status === DocumentStatus.verified);
    const applicant = await this.prisma.applicant.findUnique({ where: { id: applicantId } });
    if (allVerified && applicant?.stage === ApplicantStage.documents_pending) {
      await this.applicants
        .transition(applicantId, ApplicantStage.documents_verified, { note: 'all documents verified' })
        .catch(() => undefined);
    }
  }
}
