import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { EnrollmentStatus, Role } from '@learnai/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let service: AnalyticsService;

  const course = {
    id: 'course-1',
    instructorId: 'instructor-1',
  };

  const instructorUser = { userId: 'instructor-1', email: 'i@example.com', role: Role.INSTRUCTOR };
  const otherInstructor = { userId: 'instructor-2', email: 'other@example.com', role: Role.INSTRUCTOR };
  const adminUser = { userId: 'admin-1', email: 'admin@example.com', role: Role.ADMIN };

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = new AnalyticsService(prisma);
  });

  describe('getCourseAnalytics', () => {
    it('throws NotFoundException when the course does not exist', async () => {
      prisma.course.findUnique.mockResolvedValue(null);

      await expect(service.getCourseAnalytics('missing', instructorUser)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('denies a non-owning instructor', async () => {
      prisma.course.findUnique.mockResolvedValue(course as any);

      await expect(service.getCourseAnalytics(course.id, otherInstructor)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('allows an ADMIN regardless of ownership', async () => {
      prisma.course.findUnique.mockResolvedValue(course as any);
      prisma.enrollment.findMany.mockResolvedValue([]);
      prisma.quiz.findMany.mockResolvedValue([]);
      prisma.quizAttempt.findMany.mockResolvedValue([]);
      prisma.answerSubmission.findMany.mockResolvedValue([]);
      prisma.question.findMany.mockResolvedValue([]);
      prisma.studentProgress.findMany.mockResolvedValue([]);

      const result = await service.getCourseAnalytics(course.id, adminUser);

      expect(result.courseId).toBe(course.id);
    });

    it('computes completionRate and averageScore correctly from a small fixture', async () => {
      prisma.course.findUnique.mockResolvedValue(course as any);
      prisma.enrollment.findMany.mockResolvedValue([
        { userId: 'u1', status: EnrollmentStatus.COMPLETED },
        { userId: 'u2', status: EnrollmentStatus.ACTIVE },
      ] as any);
      prisma.quiz.findMany.mockResolvedValueOnce([{ id: 'quiz-1' }] as any).mockResolvedValueOnce([] as any);
      prisma.quizAttempt.findMany.mockResolvedValue([
        { score: 80, maxScore: 100 },
        { score: 40, maxScore: 100 },
      ] as any);
      prisma.answerSubmission.findMany.mockResolvedValue([]);
      prisma.question.findMany.mockResolvedValue([]);
      prisma.studentProgress.findMany.mockResolvedValue([]);

      const result = await service.getCourseAnalytics(course.id, instructorUser);

      expect(result.completionRate).toBeCloseTo(0.5);
      expect(result.averageScore).toBeCloseTo(60);
    });

    it('guards against divide-by-zero when there are no enrollments or attempts', async () => {
      prisma.course.findUnique.mockResolvedValue(course as any);
      prisma.enrollment.findMany.mockResolvedValue([]);
      prisma.quiz.findMany.mockResolvedValue([]);
      prisma.quizAttempt.findMany.mockResolvedValue([]);
      prisma.answerSubmission.findMany.mockResolvedValue([]);
      prisma.question.findMany.mockResolvedValue([]);
      prisma.studentProgress.findMany.mockResolvedValue([]);

      const result = await service.getCourseAnalytics(course.id, instructorUser);

      expect(result.completionRate).toBe(0);
      expect(result.averageScore).toBe(0);
    });
  });

  describe('getPlatformAnalytics', () => {
    it('aggregates counts and average score across the whole platform', async () => {
      prisma.user.count.mockResolvedValueOnce(10).mockResolvedValueOnce(2).mockResolvedValueOnce(1);
      prisma.course.count.mockResolvedValue(5);
      prisma.enrollment.count.mockResolvedValue(20);
      prisma.quizAttempt.findMany.mockResolvedValue([
        { score: 90, maxScore: 100 },
        { score: 70, maxScore: 100 },
      ] as any);

      const result = await service.getPlatformAnalytics();

      expect(result.totalUsers).toBe(13);
      expect(result.totalStudents).toBe(10);
      expect(result.totalQuizAttempts).toBe(2);
      expect(result.averageScore).toBeCloseTo(80);
    });
  });
});
