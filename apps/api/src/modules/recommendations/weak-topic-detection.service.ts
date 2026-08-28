import { Injectable, Logger } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { EVENT_EXCHANGE, RoutingKeys, WeakTopicDetectedEvent, WeakTopicDto } from '@learnai/shared';
import { PrismaService } from '../../prisma/prisma.service';

/** A topic is only evaluated for weakness once it has this many quiz attempts. */
export const MIN_ATTEMPTS = 3;

/** Below this mastery, a topic is a "primary" weakness: async recommendation pipeline fires. */
export const WEAK_TOPIC_PRIMARY_THRESHOLD = 50;

/**
 * At/above this mastery, an existing unresolved WeakTopic is considered
 * recovered and resolvedAt is stamped (row is kept for history, not deleted).
 */
export const WEAK_TOPIC_RESOLVE_THRESHOLD = 70;

/**
 * Mastery in [WEAK_TOPIC_PRIMARY_THRESHOLD, WEAK_TOPIC_RESOLVE_THRESHOLD) is a
 * "secondary / watch" zone: the WeakTopic row is still upserted (so
 * /weak-topics/me can surface it), but no WeakTopicDetected event is
 * published — only primary (<50) weaknesses trigger the recommendation
 * pipeline, to avoid over-notifying on topics that are merely shaky rather
 * than genuinely weak.
 */

/** Only publish WeakTopicDetected if severity increased by more than this since the last detection. */
export const SEVERITY_INCREASE_THRESHOLD = 5;

@Injectable()
export class WeakTopicDetectionService {
  private readonly logger = new Logger(WeakTopicDetectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly amqpConnection: AmqpConnection,
  ) {}

  /** Called once per affected topic after progress recalculation for a quiz/assessment event. */
  async detectForUser(userId: string, topicIds: string[]): Promise<void> {
    const uniqueTopicIds = Array.from(new Set(topicIds));
    for (const topicId of uniqueTopicIds) {
      await this.detectForTopic(userId, topicId);
    }
  }

  private async detectForTopic(userId: string, topicId: string): Promise<void> {
    const progress = await this.prisma.studentProgress.findUnique({
      where: { userId_topicId: { userId, topicId } },
    });
    if (!progress || progress.attemptsCount < MIN_ATTEMPTS) {
      return;
    }

    const existingWeakTopic = await this.prisma.weakTopic.findUnique({
      where: { userId_topicId: { userId, topicId } },
    });

    if (progress.masteryScore >= WEAK_TOPIC_RESOLVE_THRESHOLD) {
      if (existingWeakTopic && !existingWeakTopic.resolvedAt) {
        await this.prisma.weakTopic.update({
          where: { id: existingWeakTopic.id },
          data: { resolvedAt: new Date() },
        });
      }
      return;
    }

    // mastery < 70 (primary or watch zone): upsert the WeakTopic row.
    const severity = 100 - progress.masteryScore;
    const isNewDetection = !existingWeakTopic || !!existingWeakTopic.resolvedAt;

    await this.prisma.weakTopic.upsert({
      where: { userId_topicId: { userId, topicId } },
      create: {
        userId,
        topicId,
        severity,
        basedOnAttempts: progress.attemptsCount,
        resolvedAt: null,
      },
      update: {
        severity,
        basedOnAttempts: progress.attemptsCount,
        resolvedAt: null,
        detectedAt: new Date(),
      },
    });

    if (progress.masteryScore < WEAK_TOPIC_PRIMARY_THRESHOLD) {
      const severityIncreasedMeaningfully =
        !isNewDetection && severity - existingWeakTopic!.severity > SEVERITY_INCREASE_THRESHOLD;

      if (isNewDetection || severityIncreasedMeaningfully) {
        const event: WeakTopicDetectedEvent = {
          userId,
          topicId,
          severity,
          masteryScore: progress.masteryScore,
          occurredAt: new Date().toISOString(),
        };
        await this.amqpConnection.publish(EVENT_EXCHANGE, RoutingKeys.WEAK_TOPIC_DETECTED, event);
      }
    }
  }

  async getUnresolvedForUser(userId: string): Promise<WeakTopicDto[]> {
    const rows = await this.prisma.weakTopic.findMany({
      where: { userId, resolvedAt: null },
      include: { topic: true },
      orderBy: { severity: 'desc' },
    });

    return rows.map((row) => ({
      id: row.id,
      topicId: row.topicId,
      topicName: row.topic.name,
      severity: row.severity,
      masteryScore: 100 - row.severity,
      detectedAt: row.detectedAt.toISOString(),
    }));
  }
}
