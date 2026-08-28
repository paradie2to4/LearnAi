import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { TaxonomyService } from './taxonomy.service';

describe('TaxonomyService', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let service: TaxonomyService;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = new TaxonomyService(prisma);
  });

  it('lists subjects ordered by name', async () => {
    prisma.subject.findMany.mockResolvedValue([{ id: 's1', name: 'Computer Science' }] as any);

    const result = await service.listSubjects();

    expect(prisma.subject.findMany).toHaveBeenCalledWith({ orderBy: { name: 'asc' } });
    expect(result).toHaveLength(1);
  });

  it('lists all topics when no subjectId filter is given', async () => {
    prisma.topic.findMany.mockResolvedValue([]);

    await service.listTopics();

    expect(prisma.topic.findMany).toHaveBeenCalledWith({ where: undefined, orderBy: { name: 'asc' } });
  });

  it('filters topics by subjectId when provided', async () => {
    prisma.topic.findMany.mockResolvedValue([]);

    await service.listTopics('subject-1');

    expect(prisma.topic.findMany).toHaveBeenCalledWith({
      where: { subjectId: 'subject-1' },
      orderBy: { name: 'asc' },
    });
  });
});
