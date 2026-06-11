import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles } from '../auth/roles';
import { DocumentsService } from './documents.service';
import { CreateDocumentDto, VerifyDocumentDto } from './dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('staff', 'admin')
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  list(@Query('applicantId') applicantId: string) {
    if (!applicantId) throw new BadRequestException('applicantId is required');
    return this.documents.list(applicantId);
  }

  @Post()
  create(@Body() dto: CreateDocumentDto) {
    return this.documents.create(dto);
  }

  @Post(':id/upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  upload(@Param('id') id: string, @UploadedFile() file?: { originalname: string; buffer: Buffer }) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.documents.upload(id, file);
  }

  @Patch(':id/status')
  setStatus(@Param('id') id: string, @Body() dto: VerifyDocumentDto) {
    return this.documents.setStatus(id, dto);
  }

  // Authenticated download — files never have a public URL. Known types are served
  // inline (so they preview in-browser); anything else falls back to attachment.
  @Get(':id/file')
  async file(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const { stream, doc } = await this.documents.fileFor(id);
    const ext = (doc.filePath?.split('.').pop() ?? '').toLowerCase();
    const MIME: Record<string, string> = {
      pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
      gif: 'image/gif', webp: 'image/webp', heic: 'image/heic', svg: 'image/svg+xml',
      txt: 'text/plain',
    };
    const contentType = MIME[ext] ?? 'application/octet-stream';
    const inline = contentType !== 'application/octet-stream';
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${doc.type}-${doc.id}${ext ? '.' + ext : ''}"`,
    });
    return new StreamableFile(stream);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.documents.remove(id);
  }
}
