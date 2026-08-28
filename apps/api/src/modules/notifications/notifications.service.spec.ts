import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { NotFoundException } from '@nestjs/common';
import { NotificationType } from '@learnai/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let service: NotificationsService;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = new NotificationsService(prisma);
    prisma.notification.create.mockResolvedValue({} as any);
  });

  describe('event-driven notification creation', () => {
    it('creates a QUIZ_RESULT notification from a QuizCompletedEvent', async () => {
      await service.notifyQuizCompleted({
        userId: 'u1',
        quizId: 'q1',
        attemptId: 'a1',
        courseId: 'c1',
        isFinalAssessment: false,
        topicBreakdown: [],
        score: 8,
        maxScore: 10,
        passed: true,
        occurredAt: new Date().toISOString(),
      });

      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'u1',
            type: NotificationType.QUIZ_RESULT,
            body: 'You scored 8/10',
          }),
        }),
      );
    });

    it('creates a WEAK_TOPIC_DETECTED notification from a WeakTopicDetectedEvent', async () => {
      await service.notifyWeakTopicDetected({
        userId: 'u1',
        topicId: 't1',
        severity: 60,
        masteryScore: 40,
        occurredAt: new Date().toISOString(),
      });

      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'u1', type: NotificationType.WEAK_TOPIC_DETECTED }),
        }),
      );
    });

    it('creates a RECOMMENDATION_READY notification from a RecommendationGeneratedEvent', async () => {
      await service.notifyRecommendationGenerated({
        userId: 'u1',
        recommendationIds: ['r1', 'r2'],
        occurredAt: new Date().toISOString(),
      });

      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'u1', type: NotificationType.RECOMMENDATION_READY }),
        }),
      );
    });

    it('creates a COURSE_MILESTONE notification from a CourseCompletedEvent', async () => {
      await service.notifyCourseCompleted({
        userId: 'u1',
        courseId: 'c1',
        occurredAt: new Date().toISOString(),
      });

      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'u1', type: NotificationType.COURSE_MILESTONE }),
        }),
      );
    });
  });

  describe('markRead — ownership', () => {
    it('scopes the update to the owner via the where clause', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 1 });

      await service.markRead('u1', 'notif-1');

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { id: 'notif-1', userId: 'u1' },
        data: { isRead: true },
      });
    });

    it('rejects (no-ops) when the notification does not belong to the caller', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.markRead('not-the-owner', 'notif-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { id: 'notif-1', userId: 'not-the-owner' },
        data: { isRead: true },
      });
    });
  });

  describe('getForUser', () => {
    it('filters to unread notifications when requested', async () => {
      prisma.notification.findMany.mockResolvedValue([]);

      await service.getForUser('u1', true);

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'u1', isRead: false } }),
      );
    });
  });
});
