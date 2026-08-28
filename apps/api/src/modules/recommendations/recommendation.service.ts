import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import {
  EVENT_EXCHANGE,
  RecommendationDto,
  RecommendationGeneratedEvent,
  RecommendationStatus,
  RecommendationType,
  RoutingKeys,
  WeakTopicDetectedEvent,
} from '@learnai/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AiProvider,
  RecommendationCandidate,
  RecommendationNarrativeOutput,
} from '../ai/ai-provider.interface';
import { AI_PROVIDER } from '../ai/ai.constants';

/** Skip regenerating recommendations for the same weak topic within this window if one is already ACTIVE. */
export const RECOMMENDATION_DEDUP_WINDOW_HOURS = 24;

export const MAX_CANDIDATE_LESSONS = 3;
export const MAX_CANDIDATE_QUIZZES = 3;

@Injectable()
export class RecommendationService {
  private readonly logger = new Logger(RecommendationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly amqpConnection: AmqpConnection,
    @Inject(AI_PROVIDER) private readonly aiProvider: AiProvider,
  ) {}

  /** Invoked by the consumer on `weaktopic.detected`. */
  async generateForWeakTopic(event: WeakTopicDetectedEvent): Promise<void> {
    const weakTopic = await this.prisma.weakTopic.findUnique({
      where: { userId_topicId: { userId: event.userId, topicId: event.topicId } },
    });
    if (!weakTopic) {
      this.logger.warn(
        `No WeakTopic row for user=${event.userId} topic=${event.topicId}; skipping recommendation generation`,
      );
      return;
    }

    const dedupWindowStart = new Date(Date.now() - RECOMMENDATION_DEDUP_WINDOW_HOURS * 60 * 60 * 1000);
    const recentActive = await this.prisma.recommendation.findFirst({
      where: {
        userId: event.userId,
        weakTopicId: weakTopic.id,
        status: RecommendationStatus.ACTIVE,
        generatedAt: { gte: dedupWindowStart },
      },
    });
    if (recentActive) {
      // Idempotency guard: don't spam the AI provider or the DB.
      return;
    }

    const [user, topic] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: event.userId } }),
      this.prisma.topic.findUnique({
        where: { id: event.topicId },
        include: { lessons: { take: MAX_CANDIDATE_LESSONS } },
      }),
    ]);
    if (!user || !topic) {
      this.logger.warn(
        `User or topic missing for weak topic event (user=${event.userId} topic=${event.topicId})`,
      );
      return;
    }

    const candidateQuizzes = await this.prisma.quiz.findMany({
      where: {
        isPublished: true,
        questions: { some: { topicId: event.topicId } },
        attempts: { none: { userId: event.userId, passed: true } },
      },
      take: MAX_CANDIDATE_QUIZZES,
    });

    const candidate: RecommendationCandidate = {
      topicId: topic.id,
      topicName: topic.name,
      masteryScore: event.masteryScore,
      severity: event.severity,
      candidateLessons: topic.lessons.map((lesson) => ({ lessonId: lesson.id, title: lesson.title })),
      candidateQuizzes: candidateQuizzes.map((quiz) => ({ quizId: quiz.id, title: quiz.title })),
    };

    const narrativeOutput = await this.buildNarrative(
      user.firstName,
      candidate,
      topic.name,
      event.masteryScore,
    );

    const recommendationIds: string[] = [];
    if (narrativeOutput.studyOrder.length === 0) {
      const rec = await this.prisma.recommendation.create({
        data: {
          userId: event.userId,
          type: RecommendationType.REVIEW_TOPIC,
          weakTopicId: weakTopic.id,
          narrative: narrativeOutput.narrative,
          studyOrder: 0,
          status: RecommendationStatus.ACTIVE,
        },
      });
      recommendationIds.push(rec.id);
    } else {
      for (const [index, item] of narrativeOutput.studyOrder.entries()) {
        const rec = await this.prisma.recommendation.create({
          data: {
            userId: event.userId,
            type: RecommendationType.REVIEW_TOPIC,
            weakTopicId: weakTopic.id,
            lessonId: item.lessonId ?? null,
            narrative: item.rationale || narrativeOutput.narrative,
            studyOrder: index,
            status: RecommendationStatus.ACTIVE,
          },
        });
        recommendationIds.push(rec.id);
      }
    }

    const generatedEvent: RecommendationGeneratedEvent = {
      userId: event.userId,
      recommendationIds,
      occurredAt: new Date().toISOString(),
    };
    await this.amqpConnection.publish(EVENT_EXCHANGE, RoutingKeys.RECOMMENDATION_GENERATED, generatedEvent);
  }

  private async buildNarrative(
    studentFirstName: string,
    candidate: RecommendationCandidate,
    topicName: string,
    masteryScore: number,
  ): Promise<RecommendationNarrativeOutput> {
    try {
      return await this.aiProvider.generateRecommendationNarrative({
        studentFirstName,
        candidates: [candidate],
      });
    } catch (error) {
      // AiUnavailableException (no API key configured) or any other AI
      // failure: degrade gracefully with a deterministic templated
      // narrative rather than failing the whole event-driven pipeline.
      this.logger.warn(
        `AI provider unavailable, falling back to templated narrative for topic=${candidate.topicId}: ${
          (error as Error).message
        }`,
      );
      return {
        narrative: `Focus on reviewing ${topicName} — your mastery is currently ${Math.round(masteryScore)}%.`,
        studyOrder: [],
      };
    }
  }

  async getForUser(userId: string): Promise<RecommendationDto[]> {
    const rows = await this.prisma.recommendation.findMany({
      where: { userId },
      include: { weakTopic: true },
      orderBy: { generatedAt: 'desc' },
    });

    return rows.map((row) => ({
      id: row.id,
      type: row.type as unknown as RecommendationType,
      status: row.status as unknown as RecommendationStatus,
      narrative: row.narrative,
      studyOrder: row.studyOrder,
      topicId: row.weakTopic?.topicId ?? null,
      courseId: row.courseId,
      lessonId: row.lessonId,
      generatedAt: row.generatedAt.toISOString(),
    }));
  }

  /** Owner-only: the `where` includes userId so a non-owner's update matches zero rows. */
  async dismiss(userId: string, id: string): Promise<{ success: boolean }> {
    const result = await this.prisma.recommendation.updateMany({
      where: { id, userId },
      data: { status: RecommendationStatus.DISMISSED, dismissedAt: new Date() },
    });
    if (result.count === 0) {
      throw new NotFoundException('Recommendation not found');
    }
    return { success: true };
  }
}
