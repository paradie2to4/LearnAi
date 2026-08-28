import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { EnrollmentStatus, Role } from '@learnai/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { EnrollmentsService } from './enrollments.service';

describe('EnrollmentsService', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let service: EnrollmentsService;

  const student: AuthenticatedUser = {
    userId: 'student-1',
    email: 'student@example.com',
    role: Role.STUDENT,
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

  const publishedCourse = {
    id: 'course-1',
    title: 'Intro to TypeScript',
    description: 'Learn TypeScript fundamentals',
    subjectId: 'subject-1',
    instructorId: 'instructor-1',
    isPublished: true,
    isArchived: false,
  };

  const unpublishedCourse = { ...publishedCourse, id: 'course-2', isPublished: false };

  const courseWithRelations = {
    ...publishedCourse,
    subject: { id: 'subject-1', name: 'Programming', description: null },
    instructor: { id: 'instructor-1', firstName: 'Ida', lastName: 'Tarbell' },
    _count: { enrollments: 1 },
  };

  const existingEnrollment = {
    id: 'enrollment-1',
    userId: 'student-1',
    courseId: 'course-1',
    status: EnrollmentStatus.ACTIVE,
    enrolledAt: new Date('2026-01-01T00:00:00Z'),
    completedAt: null,
    course: courseWithRelations,
  };

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = new EnrollmentsService(prisma);
  });

  describe('enroll', () => {
    it('is idempotent: returns the existing enrollment instead of creating a duplicate', async () => {
      prisma.course.findUnique.mockResolvedValue(publishedCourse as any);
      prisma.enrollment.findUnique.mockResolvedValue(existingEnrollment as any);

      const result = await service.enroll('course-1', student);
      const secondResult = await service.enroll('course-1', student);

      expect(result.id).toBe('enrollment-1');
      expect(secondResult.id).toBe('enrollment-1');
      expect(prisma.enrollment.create).not.toHaveBeenCalled();
    });

    it('rejects enrolling in an unpublished course', async () => {
      prisma.course.findUnique.mockResolvedValue(unpublishedCourse as any);

      await expect(service.enroll('course-2', student)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.enrollment.create).not.toHaveBeenCalled();
    });

    it('creates a new enrollment when none exists', async () => {
      prisma.course.findUnique.mockResolvedValue(publishedCourse as any);
      prisma.enrollment.findUnique.mockResolvedValue(null);
      prisma.enrollment.create.mockResolvedValue(existingEnrollment as any);

      const result = await service.enroll('course-1', student);

      expect(result.id).toBe('enrollment-1');
      expect(prisma.enrollment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { userId: 'student-1', courseId: 'course-1' } }),
      );
    });
  });

  describe('drop', () => {
    it('sets status to DROPPED rather than deleting the row', async () => {
      prisma.enrollment.findUnique.mockResolvedValue({ ...existingEnrollment } as any);

      await service.drop('enrollment-1', student);

      expect(prisma.enrollment.delete).not.toHaveBeenCalled();
      expect(prisma.enrollment.update).toHaveBeenCalledWith({
        where: { id: 'enrollment-1' },
        data: { status: EnrollmentStatus.DROPPED },
      });
    });

    it('denies dropping an enrollment owned by someone else', async () => {
      prisma.enrollment.findUnique.mockResolvedValue({
        ...existingEnrollment,
        userId: 'someone-else',
      } as any);

      await expect(service.drop('enrollment-1', student)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.enrollment.update).not.toHaveBeenCalled();
    });
  });

  describe('getRoster', () => {
    it('denies a non-owning instructor', async () => {
      prisma.course.findUnique.mockResolvedValue(publishedCourse as any);

      await expect(service.getRoster('course-1', otherInstructor)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('denies a student', async () => {
      prisma.course.findUnique.mockResolvedValue(publishedCourse as any);

      await expect(service.getRoster('course-1', student)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows the owning instructor', async () => {
      prisma.course.findUnique.mockResolvedValue(publishedCourse as any);
      prisma.enrollment.findMany.mockResolvedValue([]);

      await expect(service.getRoster('course-1', owningInstructor)).resolves.toEqual([]);
    });
  });
});
