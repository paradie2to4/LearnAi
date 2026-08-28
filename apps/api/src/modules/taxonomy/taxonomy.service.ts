import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

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
}
