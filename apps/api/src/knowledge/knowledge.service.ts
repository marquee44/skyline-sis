import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateKnowledgeDto, UpdateKnowledgeDto } from './dto';

@Injectable()
export class KnowledgeService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.knowledgeEntry.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  }

  create(dto: CreateKnowledgeDto) {
    return this.prisma.knowledgeEntry.create({ data: dto });
  }

  async update(id: string, dto: UpdateKnowledgeDto) {
    await this.get(id);
    return this.prisma.knowledgeEntry.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.get(id);
    return this.prisma.knowledgeEntry.delete({ where: { id } });
  }

  private async get(id: string) {
    const e = await this.prisma.knowledgeEntry.findUnique({ where: { id } });
    if (!e) throw new NotFoundException('Knowledge entry not found');
    return e;
  }
}
