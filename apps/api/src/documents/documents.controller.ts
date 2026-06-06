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

  // Authenticated download — files never have a public URL.
  @Get(':id/file')
  async file(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const { stream, doc } = await this.documents.fileFor(id);
    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${doc.type}-${doc.id}"`,
    });
    return new StreamableFile(stream);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.documents.remove(id);
  }
}
