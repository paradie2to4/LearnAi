import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CourseCompletedEvent,
  NotificationDto,
  NotificationType,
  QuizCompletedEvent,
  RecommendationGeneratedEvent,
  WeakTopicDetectedEvent,
} from '@learnai/shared';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    type: NotificationType,
    title: string,
    body: string,
    metadata?: Record<string, unknown>,
  ) {
    return this.prisma.notification.create({
      data: {
        userId,
        type,
        title,
        body,
        metadata: (metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  // -----------------------------------------------------------------------
  // Event handlers (called directly by NotificationsConsumer's thin
  // @RabbitSubscribe wrappers — no broker required to invoke these in tests).
  // -----------------------------------------------------------------------

  notifyQuizCompleted(payload: QuizCompletedEvent) {
    return this.create(
      payload.userId,
      NotificationType.QUIZ_RESULT,
      'Quiz result ready',
      `You scored ${payload.score}/${payload.maxScore}`,
      { quizId: payload.quizId, attemptId: payload.attemptId, passed: payload.passed },
    );
  }

  notifyWeakTopicDetected(payload: WeakTopicDetectedEvent) {
    return this.create(
      payload.userId,
      NotificationType.WEAK_TOPIC_DETECTED,
      'A weak topic was detected',
      `We noticed you're struggling with a topic (mastery ${Math.round(payload.masteryScore)}%). Check your recommendations for help.`,
      { topicId: payload.topicId, severity: payload.severity, masteryScore: payload.masteryScore },
    );
  }

  notifyRecommendationGenerated(payload: RecommendationGeneratedEvent) {
    return this.create(
      payload.userId,
      NotificationType.RECOMMENDATION_READY,
      'New study recommendations ready',
      'We generated new personalized study recommendations for you.',
      { recommendationIds: payload.recommendationIds },
    );
  }

  notifyCourseCompleted(payload: CourseCompletedEvent) {
    return this.create(
      payload.userId,
      NotificationType.COURSE_MILESTONE,
      'Course completed',
      'Congratulations! You completed the course.',
      { courseId: payload.courseId },
    );
  }

  // -----------------------------------------------------------------------
  // Reads / writes exposed over HTTP
  // -----------------------------------------------------------------------

  async getForUser(userId: string, unreadOnly = false): Promise<NotificationDto[]> {
    const rows = await this.prisma.notification.findMany({
      where: { userId, ...(unreadOnly ? { isRead: false } : {}) },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.toDto(row));
  }

  /** Owner-only: the `where` includes userId so a non-owner's update matches zero rows. */
  async markRead(userId: string, id: string): Promise<{ success: boolean }> {
    const result = await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });
    if (result.count === 0) {
      throw new NotFoundException('Notification not found');
    }
    return { success: true };
  }

  async markAllRead(userId: string): Promise<{ success: boolean }> {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return { success: true };
  }

  private toDto(row: {
    id: string;
    type: string;
    title: string;
    body: string;
    isRead: boolean;
    createdAt: Date;
  }): NotificationDto {
    return {
      id: row.id,
      type: row.type as NotificationType,
      title: row.title,
      body: row.body,
      isRead: row.isRead,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
