import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { EVENT_EXCHANGE, RoutingKeys } from '@learnai/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ProgressService, MASTERY_EWMA_ALPHA } from './progress.service';

describe('ProgressService', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let amqpConnection: DeepMockProxy<AmqpConnection>;
  let service: ProgressService;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    amqpConnection = mockDeep<AmqpConnection>();
    service = new ProgressService(prisma, amqpConnection);
  });

  describe('recalculateForQuizCompleted — EWMA mastery', () => {
    it('initializes masteryScore to correct/total*100 on the first-ever record for a topic', async () => {
      prisma.studentProgress.findUnique.mockResolvedValue(null);
      prisma.studentProgress.upsert.mockResolvedValue({} as any);
      prisma.activityEvent.create.mockResolvedValue({} as any);

      await service.recalculateForQuizCompleted({
        userId: 'u1',
        quizId: 'q1',
        attemptId: 'a1',
        courseId: null,
        isFinalAssessment: false,
        topicBreakdown: [{ topicId: 't1', correct: 3, total: 4 }],
        score: 3,
        maxScore: 4,
        passed: true,
        occurredAt: new Date().toISOString(),
      });

      expect(prisma.studentProgress.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            masteryScore: 75,
            attemptsCount: 1,
            correctCount: 3,
          }),
        }),
      );
    });

    it('applies the exact EWMA formula against an existing mastery score', async () => {
      prisma.studentProgress.findUnique.mockResolvedValue({
        id: 'sp1',
        userId: 'u1',
        topicId: 't1',
        masteryScore: 60,
        attemptsCount: 2,
        correctCount: 1,
        lastActivityAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
      prisma.studentProgress.upsert.mockResolvedValue({} as any);
      prisma.activityEvent.create.mockResolvedValue({} as any);

      await service.recalculateForQuizCompleted({
        userId: 'u1',
        quizId: 'q1',
        attemptId: 'a1',
        courseId: null,
        isFinalAssessment: false,
        topicBreakdown: [{ topicId: 't1', correct: 2, total: 2 }],
        score: 2,
        maxScore: 2,
        passed: true,
        occurredAt: new Date().toISOString(),
      });

      const sampleScore = (2 / 2) * 100; // 100
      const expectedMastery = 60 * (1 - MASTERY_EWMA_ALPHA) + sampleScore * MASTERY_EWMA_ALPHA; // 60*0.7+100*0.3=72

      expect(prisma.studentProgress.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            masteryScore: expectedMastery,
            attemptsCount: { increment: 1 },
            correctCount: { increment: 2 },
          }),
        }),
      );
    });
  });

  describe('recalculateForLessonCompleted — idempotency + completion', () => {
    it('does not double-insert an ActivityEvent for a lesson already recorded', async () => {
      prisma.activityEvent.findFirst.mockResolvedValue({ id: 'existing' } as any);
      prisma.lesson.count.mockResolvedValue(4);
      prisma.activityEvent.findMany.mockResolvedValue([]);
      prisma.courseProgress.findUnique.mockResolvedValue(null);
      prisma.courseProgress.upsert.mockResolvedValue({} as any);

      await service.recalculateForLessonCompleted({
        userId: 'u1',
        courseId: 'c1',
        lessonId: 'l1',
        occurredAt: new Date().toISOString(),
      });

      expect(prisma.activityEvent.create).not.toHaveBeenCalled();
    });

    it('guards divide-by-zero when a course has zero total lessons', async () => {
      prisma.activityEvent.findFirst.mockResolvedValue(null);
      prisma.activityEvent.create.mockResolvedValue({} as any);
      prisma.lesson.count.mockResolvedValue(0);
      prisma.activityEvent.findMany.mockResolvedValue([]);
      prisma.courseProgress.findUnique.mockResolvedValue(null);
      prisma.courseProgress.upsert.mockResolvedValue({} as any);

      await service.recalculateForLessonCompleted({
        userId: 'u1',
        courseId: 'c1',
        lessonId: 'l1',
        occurredAt: new Date().toISOString(),
      });

      expect(prisma.courseProgress.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ completionPercent: 0, totalLessons: 0 }),
        }),
      );
      expect(amqpConnection.publish).not.toHaveBeenCalled();
    });

    it('publishes CourseCompleted only when completion reaches exactly 100%', async () => {
      prisma.activityEvent.findFirst.mockResolvedValue(null);
      prisma.activityEvent.create.mockResolvedValue({} as any);
      prisma.lesson.count.mockResolvedValue(2);
      // 2 distinct completed lessons out of 2 total => 100%
      prisma.activityEvent.findMany.mockImplementation((args: any) => {
        if (args?.distinct) {
          return Promise.resolve([{ lessonId: 'l1' }, { lessonId: 'l2' }]) as any;
        }
        return Promise.resolve([]) as any;
      });
      prisma.courseProgress.findUnique.mockResolvedValue({
        userId: 'u1',
        courseId: 'c1',
        completionPercent: 50,
        lessonsCompleted: 1,
        totalLessons: 2,
        currentStreakDays: 1,
        longestStreakDays: 1,
        lastActivityDate: new Date(),
      } as any);
      prisma.courseProgress.upsert.mockResolvedValue({} as any);

      await service.recalculateForLessonCompleted({
        userId: 'u1',
        courseId: 'c1',
        lessonId: 'l2',
        occurredAt: new Date().toISOString(),
      });

      expect(prisma.courseProgress.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: expect.objectContaining({ completionPercent: 100 }) }),
      );
      expect(amqpConnection.publish).toHaveBeenCalledWith(
        EVENT_EXCHANGE,
        RoutingKeys.COURSE_COMPLETED,
        expect.objectContaining({ userId: 'u1', courseId: 'c1' }),
      );
    });

    it('does not re-publish CourseCompleted if the course was already at 100%', async () => {
      prisma.activityEvent.findFirst.mockResolvedValue({ id: 'existing' } as any);
      prisma.lesson.count.mockResolvedValue(2);
      prisma.activityEvent.findMany.mockImplementation((args: any) => {
        if (args?.distinct) {
          return Promise.resolve([{ lessonId: 'l1' }, { lessonId: 'l2' }]) as any;
        }
        return Promise.resolve([]) as any;
      });
      prisma.courseProgress.findUnique.mockResolvedValue({
        userId: 'u1',
        courseId: 'c1',
        completionPercent: 100,
        lessonsCompleted: 2,
        totalLessons: 2,
        currentStreakDays: 1,
        longestStreakDays: 1,
        lastActivityDate: new Date(),
      } as any);
      prisma.courseProgress.upsert.mockResolvedValue({} as any);

      await service.recalculateForLessonCompleted({
        userId: 'u1',
        courseId: 'c1',
        lessonId: 'l2',
        occurredAt: new Date().toISOString(),
      });

      expect(amqpConnection.publish).not.toHaveBeenCalled();
    });
  });

  describe('streak computation (via recalculateForLessonCompleted)', () => {
    function mockLessonCompletionPipeline(activityDates: Date[]) {
      prisma.activityEvent.findFirst.mockResolvedValue(null);
      prisma.activityEvent.create.mockResolvedValue({} as any);
      prisma.lesson.count.mockResolvedValue(10);
      prisma.activityEvent.findMany.mockImplementation((args: any) => {
        if (args?.distinct) {
          return Promise.resolve([{ lessonId: 'l1' }]) as any;
        }
        return Promise.resolve(activityDates.map((occurredAt) => ({ occurredAt }))) as any;
      });
      prisma.courseProgress.findUnique.mockResolvedValue(null);
      prisma.courseProgress.upsert.mockResolvedValue({} as any);
    }

    it('continues the streak across consecutive days and resets after a gap day', async () => {
      const today = new Date('2026-08-28T12:00:00.000Z');
      jest.useFakeTimers().setSystemTime(today);

      // Active today, yesterday, day-before => 3-day streak. Then a gap
      // before 2026-08-20 breaks it (older run of 2 consecutive days).
      const dates = [
        new Date('2026-08-28T09:00:00.000Z'),
        new Date('2026-08-27T09:00:00.000Z'),
        new Date('2026-08-26T09:00:00.000Z'),
        new Date('2026-08-20T09:00:00.000Z'),
        new Date('2026-08-19T09:00:00.000Z'),
      ];
      mockLessonCompletionPipeline(dates);

      await service.recalculateForLessonCompleted({
        userId: 'u1',
        courseId: 'c1',
        lessonId: 'l1',
        occurredAt: today.toISOString(),
      });

      expect(prisma.courseProgress.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ currentStreakDays: 3, longestStreakDays: 3 }),
        }),
      );

      jest.useRealTimers();
    });

    it('does not double-count two activities on the same day', async () => {
      const today = new Date('2026-08-28T12:00:00.000Z');
      jest.useFakeTimers().setSystemTime(today);

      const dates = [
        new Date('2026-08-28T01:00:00.000Z'),
        new Date('2026-08-28T09:00:00.000Z'), // same UTC day as above
      ];
      mockLessonCompletionPipeline(dates);

      await service.recalculateForLessonCompleted({
        userId: 'u1',
        courseId: 'c1',
        lessonId: 'l1',
        occurredAt: today.toISOString(),
      });

      expect(prisma.courseProgress.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ currentStreakDays: 1, longestStreakDays: 1 }),
        }),
      );

      jest.useRealTimers();
    });

    it('reports a zero current streak when the last activity is older than yesterday', async () => {
      const today = new Date('2026-08-28T12:00:00.000Z');
      jest.useFakeTimers().setSystemTime(today);

      const dates = [new Date('2026-08-20T09:00:00.000Z')];
      mockLessonCompletionPipeline(dates);

      await service.recalculateForLessonCompleted({
        userId: 'u1',
        courseId: 'c1',
        lessonId: 'l1',
        occurredAt: today.toISOString(),
      });

      expect(prisma.courseProgress.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ currentStreakDays: 0, longestStreakDays: 1 }),
        }),
      );

      jest.useRealTimers();
    });
  });
});
