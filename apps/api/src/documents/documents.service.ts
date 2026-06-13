import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ZipArchive } from 'archiver';
import { ApplicantStage, DocumentStatus } from '@skyline/db';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ApplicantsService } from '../applicants/applicants.service';
import { NotificationsService } from '../notifications/notifications.service';
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
    private readonly notifications: NotificationsService,
  ) {}

  list(applicantId: string) {
    return this.prisma.document.findMany({
      where: { applicantId, deletedAt: null },
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
    const applicant = await this.assertCollectable(dto.applicantId);
    const doc = await this.prisma.document.create({
      data: {
        applicantId: dto.applicantId,
        type: dto.type,
        status: DocumentStatus.required,
        notes: dto.notes,
      },
    });
    void this.notifications.documentRequested(applicant, dto.type);
    return doc;
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
    if (!doc || !doc.filePath || doc.deletedAt) throw new NotFoundException('No file for this document');
    return { stream: this.storage.readStream(doc.filePath), doc };
  }

  /**
   * A complete enrollment package for the partner university: a summary sheet with
   * the student's details + program, plus every uploaded document, zipped together.
   */
  async buildEnrollmentPackage(applicantId: string) {
    const a = await this.prisma.applicant.findUnique({
      where: { id: applicantId },
      include: { chosenProgram: { include: { university: true } }, documents: true },
    });
    if (!a) throw new NotFoundException('Applicant not found');

    const docs = a.documents.filter((d) => !d.deletedAt);
    const archive = new ZipArchive({ zlib: { level: 9 } });
    archive.append(this.enrollmentSummary({ ...a, documents: docs }), { name: 'enrollment-summary.txt' });
    for (const d of docs) {
      if (!d.filePath) continue;
      const ext = d.filePath.split('.').pop();
      archive.append(this.storage.readStream(d.filePath), { name: `documents/${d.type}${ext ? '.' + ext : ''}` });
    }
    const slug = `${a.lastName}-${a.firstName}`.toLowerCase().replace(/[^a-z0-9]+/g, '-') || a.id;
    return { archive, filename: `enrollment-${slug}.zip` };
  }

  private enrollmentSummary(a: {
    firstName: string; lastName: string; email: string; phone: string | null;
    dateOfBirth: Date | null; gender: string | null; countryOfOrigin: string | null;
    residenceCity: string | null; addressLine: string | null; priorEducation: string | null;
    stage: string; scholarshipPercent: { toString(): string } | null;
    sponsorName: string | null; sponsorContact: string | null;
    emergencyContactName: string | null; emergencyContactPhone: string | null;
    chosenProgram: { name: string; level: string; university: { name: string; country: string } | null } | null;
    documents: { type: string; status: string; filePath: string | null }[];
  }): string {
    const row = (k: string, v: unknown) => `${k.padEnd(24)} ${v ?? '—'}`;
    const dob = a.dateOfBirth ? new Date(a.dateOfBirth).toISOString().slice(0, 10) : '—';
    const sch = a.scholarshipPercent && Number(a.scholarshipPercent.toString()) > 0 ? `${a.scholarshipPercent.toString()}%` : 'none';
    return [
      'SKYLINE ADMISSION SERVICES — STUDENT ENROLLMENT PACKAGE',
      '='.repeat(56),
      '',
      'STUDENT',
      row('Full name', `${a.firstName} ${a.lastName}`),
      row('Email', a.email),
      row('Phone', a.phone),
      row('Date of birth', dob),
      row('Gender', a.gender),
      row('Nationality', a.countryOfOrigin),
      row('Residence city', a.residenceCity),
      row('Address', a.addressLine),
      row('Prior education', a.priorEducation),
      '',
      'PROGRAM',
      row('University', a.chosenProgram?.university?.name),
      row('Country', a.chosenProgram?.university?.country),
      row('Program', a.chosenProgram ? `${a.chosenProgram.name} (${a.chosenProgram.level})` : '—'),
      row('Status', a.stage),
      row('Scholarship', sch),
      '',
      'SPONSOR / EMERGENCY',
      row('Sponsor', a.sponsorName ? `${a.sponsorName}${a.sponsorContact ? ' · ' + a.sponsorContact : ''}` : '—'),
      row('Emergency contact', a.emergencyContactName ? `${a.emergencyContactName}${a.emergencyContactPhone ? ' · ' + a.emergencyContactPhone : ''}` : '—'),
      '',
      'DOCUMENTS ENCLOSED',
      ...(a.documents.length ? a.documents.map((d) => `  - ${d.type.padEnd(18)} ${d.filePath ? d.status : 'NOT UPLOADED'}`) : ['  (none)']),
      '',
      `Generated ${new Date().toISOString()}`,
    ].join('\n');
  }

  // Soft-delete: archive the slot (and keep the file) so it's recoverable, rather
  // than erasing the record + file.
  async remove(documentId: string) {
    const doc = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!doc) throw new NotFoundException('Document not found');
    if (doc.deletedAt) return doc;
    return this.prisma.document.update({ where: { id: documentId }, data: { deletedAt: new Date() } });
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
