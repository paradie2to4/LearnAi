import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { CreateTopicDto } from './dto/create-topic.dto';

@Injectable()
export class TaxonomyService {
  constructor(private readonly prisma: PrismaService) {}

  listSubjects() {
    return this.prisma.subject.findMany({ orderBy: { name: 'asc' } });
  }

  listTopics(subjectId?: string) {
    return this.prisma.topic.findMany({
      where: subjectId ? { subjectId } : undefined,
      orderBy: { name: 'asc' },
    });
  }

  async createSubject(dto: CreateSubjectDto) {
    try {
      return await this.prisma.subject.create({
        data: { name: dto.name, description: dto.description },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`A subject named "${dto.name}" already exists`);
      }
      throw err;
    }
  }

  async createTopic(dto: CreateTopicDto) {
    const subject = await this.prisma.subject.findUnique({ where: { id: dto.subjectId } });
    if (!subject) {
      throw new NotFoundException('Subject not found');
    }
    try {
      return await this.prisma.topic.create({
        data: { name: dto.name, subjectId: dto.subjectId },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`A topic named "${dto.name}" already exists in this subject`);
      }
      throw err;
    }
  }
}
