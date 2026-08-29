import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { TaxonomyService } from './taxonomy.service';

function uniqueConstraintError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '5.22.0',
  });
}

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

  describe('createSubject', () => {
    it('creates a subject with the given name and description', async () => {
      prisma.subject.create.mockResolvedValue({ id: 's1', name: 'Computer Science' } as any);

      const result = await service.createSubject({ name: 'Computer Science', description: 'CS basics' });

      expect(prisma.subject.create).toHaveBeenCalledWith({
        data: { name: 'Computer Science', description: 'CS basics' },
      });
      expect(result).toEqual({ id: 's1', name: 'Computer Science' });
    });

    it('throws ConflictException when the subject name already exists', async () => {
      prisma.subject.create.mockRejectedValue(uniqueConstraintError());

      await expect(service.createSubject({ name: 'Computer Science' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('createTopic', () => {
    it('throws NotFoundException when the parent subject does not exist', async () => {
      prisma.subject.findUnique.mockResolvedValue(null);

      await expect(
        service.createTopic({ name: 'Transactions', subjectId: 'missing' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.topic.create).not.toHaveBeenCalled();
    });

    it('creates a topic scoped to the given subject', async () => {
      prisma.subject.findUnique.mockResolvedValue({ id: 'subject-1', name: 'CS' } as any);
      prisma.topic.create.mockResolvedValue({
        id: 't1',
        name: 'Transactions',
        subjectId: 'subject-1',
      } as any);

      const result = await service.createTopic({ name: 'Transactions', subjectId: 'subject-1' });

      expect(prisma.topic.create).toHaveBeenCalledWith({
        data: { name: 'Transactions', subjectId: 'subject-1' },
      });
      expect(result).toEqual({ id: 't1', name: 'Transactions', subjectId: 'subject-1' });
    });

    it('throws ConflictException when the topic name already exists in this subject', async () => {
      prisma.subject.findUnique.mockResolvedValue({ id: 'subject-1', name: 'CS' } as any);
      prisma.topic.create.mockRejectedValue(uniqueConstraintError());

      await expect(
        service.createTopic({ name: 'Transactions', subjectId: 'subject-1' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
