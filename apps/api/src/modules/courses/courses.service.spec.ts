import { ForbiddenException } from '@nestjs/common';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { Role } from '@learnai/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { CoursesService } from './courses.service';

describe('CoursesService', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let service: CoursesService;

  const course = {
    id: 'course-1',
    title: 'Intro to TypeScript',
    description: 'Learn TypeScript fundamentals',
    subjectId: 'subject-1',
    instructorId: 'instructor-1',
    isPublished: false,
    isArchived: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };

  const courseWithRelations = {
    ...course,
    subject: { id: 'subject-1', name: 'Programming', description: null },
    instructor: { id: 'instructor-1', firstName: 'Ida', lastName: 'Tarbell' },
    _count: { enrollments: 3 },
  };

  const owningInstructor: AuthenticatedUser = {
    userId: 'instructor-1',
    email: 'owner@example.com',
    role: Role.INSTRUCTOR,
  };
  const otherInstructor: AuthenticatedUser = {
    userId: 'instructor-2',
    email: 'other@example.com',
    role: Role.INSTRUCTOR,
  };
  const student: AuthenticatedUser = {
    userId: 'student-1',
    email: 'student@example.com',
    role: Role.STUDENT,
  };
  const admin: AuthenticatedUser = { userId: 'admin-1', email: 'admin@example.com', role: Role.ADMIN };

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = new CoursesService(prisma);
  });

  describe('ownership enforcement', () => {
    it('denies a non-owning instructor from updating a course', async () => {
      prisma.course.findUnique.mockResolvedValue(course as any);

      await expect(
        service.update('course-1', { title: 'New title' }, otherInstructor),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.course.update).not.toHaveBeenCalled();
    });

    it('denies a student from updating a course', async () => {
      prisma.course.findUnique.mockResolvedValue(course as any);

      await expect(service.update('course-1', { title: 'New title' }, student)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.course.update).not.toHaveBeenCalled();
    });

    it('denies a non-owning instructor from publishing a course', async () => {
      prisma.course.findUnique.mockResolvedValue(course as any);

      await expect(service.publish('course-1', otherInstructor)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.course.update).not.toHaveBeenCalled();
    });

    it('denies a student from publishing a course', async () => {
      prisma.course.findUnique.mockResolvedValue(course as any);

      await expect(service.publish('course-1', student)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.course.update).not.toHaveBeenCalled();
    });

    it('allows ADMIN to update a course owned by someone else', async () => {
      prisma.course.findUnique.mockResolvedValue(course as any);
      prisma.course.update.mockResolvedValue(courseWithRelations as any);

      const result = await service.update('course-1', { title: 'New title' }, admin);

      expect(result.title).toBe(courseWithRelations.title);
      expect(prisma.course.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'course-1' } }),
      );
    });

    it('allows the owning instructor to update their own course', async () => {
      prisma.course.findUnique.mockResolvedValue(course as any);
      prisma.course.update.mockResolvedValue(courseWithRelations as any);

      await expect(
        service.update('course-1', { title: 'New title' }, owningInstructor),
      ).resolves.toBeDefined();
      expect(prisma.course.update).toHaveBeenCalled();
    });

    it('allows the owning instructor to publish their own course', async () => {
      prisma.course.findUnique.mockResolvedValue(course as any);
      prisma.course.update.mockResolvedValue({ ...courseWithRelations, isPublished: true } as any);

      const result = await service.publish('course-1', owningInstructor);

      expect(result.isPublished).toBe(true);
      expect(prisma.course.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'course-1' }, data: { isPublished: true } }),
      );
    });
  });

  describe('findMine', () => {
    it("scopes the query to the caller's own instructorId", async () => {
      prisma.course.findMany.mockResolvedValue([courseWithRelations] as any);

      await service.findMine(owningInstructor);

      expect(prisma.course.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { instructorId: 'instructor-1' } }),
      );
    });

    it('includes unpublished courses (unlike findPublished)', async () => {
      prisma.course.findMany.mockResolvedValue([courseWithRelations] as any);

      const result = await service.findMine(owningInstructor);

      expect(result).toHaveLength(1);
    });

    it('returns every course for ADMIN regardless of owner', async () => {
      prisma.course.findMany.mockResolvedValue([courseWithRelations] as any);

      await service.findMine(admin);

      expect(prisma.course.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
    });
  });

  describe('create', () => {
    it('sets instructorId to the current user for an instructor', async () => {
      prisma.course.create.mockResolvedValue(courseWithRelations as any);

      await service.create(
        { title: 'New course', description: 'A brand new course', subjectId: 'subject-1' },
        owningInstructor,
      );

      expect(prisma.course.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ instructorId: 'instructor-1' }) }),
      );
    });

    it('lets ADMIN assign an explicit instructor', async () => {
      prisma.course.create.mockResolvedValue(courseWithRelations as any);

      await service.create(
        {
          title: 'New course',
          description: 'A brand new course',
          subjectId: 'subject-1',
          instructorId: 'instructor-9',
        },
        admin,
      );

      expect(prisma.course.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ instructorId: 'instructor-9' }) }),
      );
    });

    it('ignores an instructorId supplied by a non-admin', async () => {
      prisma.course.create.mockResolvedValue(courseWithRelations as any);

      await service.create(
        {
          title: 'New course',
          description: 'A brand new course',
          subjectId: 'subject-1',
          instructorId: 'someone-else',
        },
        owningInstructor,
      );

      expect(prisma.course.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ instructorId: 'instructor-1' }) }),
      );
    });
  });
});
