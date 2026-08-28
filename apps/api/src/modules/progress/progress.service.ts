import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import {
  ActivityType,
  AttemptStatus,
  CourseCompletedEvent,
  EVENT_EXCHANGE,
  LessonCompletedEvent,
  ProgressSummaryDto,
  QuizCompletedEvent,
  RoutingKeys,
} from '@learnai/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { computeStreak } from './streak.util';

/**
 * EWMA smoothing factor for mastery updates: newMastery = old*(1-a) + sample*a.
 * A named constant per the brief, tuned so a single quiz attempt nudges
 * mastery without letting one bad/lucky attempt swing it wildly.
 */
export const MASTERY_EWMA_ALPHA = 0.3;

@Injectable()
export class ProgressService {
  private readonly logger = new Logger(ProgressService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly amqpConnection: AmqpConnection,
  ) {}

  // ---------------------------------------------------------------------
  // Event-driven writes
  // ---------------------------------------------------------------------

  /**
   * Consumes QuizCompletedEvent (routing key `quiz.completed`, also reused
   * for `assessment.submitted` payloads which share the same shape).
   * Updates per-topic mastery via EWMA, records an ActivityEvent, and
   * refreshes the course's streak fields (but NOT lesson-completion counts,
   * which are only driven by LessonCompletedEvent).
   */
  async recalculateForQuizCompleted(payload: QuizCompletedEvent): Promise<void> {
    for (const entry of payload.topicBreakdown) {
      await this.applyQuizResultToTopic(payload.userId, entry.topicId, entry.correct, entry.total);
    }

    await this.prisma.activityEvent.create({
      data: {
        userId: payload.userId,
        courseId: payload.courseId ?? undefined,
        type: ActivityType.QUIZ_COMPLETED,
        occurredAt: new Date(payload.occurredAt),
      },
    });

    if (payload.courseId) {
      await this.syncCourseStreak(payload.userId, payload.courseId);
    }
  }

  private async applyQuizResultToTopic(
    userId: string,
    topicId: string,
    correct: number,
    total: number,
  ): Promise<void> {
    const existing = await this.prisma.studentProgress.findUnique({
      where: { userId_topicId: { userId, topicId } },
    });

    const sampleScore = total > 0 ? (correct / total) * 100 : 0;
    const newMastery = existing
      ? existing.masteryScore * (1 - MASTERY_EWMA_ALPHA) + sampleScore * MASTERY_EWMA_ALPHA
      : sampleScore;

    await this.prisma.studentProgress.upsert({
      where: { userId_topicId: { userId, topicId } },
      create: {
        userId,
        topicId,
        masteryScore: newMastery,
        attemptsCount: 1,
        correctCount: correct,
        lastActivityAt: new Date(),
      },
      update: {
        masteryScore: newMastery,
        attemptsCount: { increment: 1 },
        correctCount: { increment: correct },
        lastActivityAt: new Date(),
      },
    });
  }

  /**
   * Consumes LessonCompletedEvent (routing key `lesson.completed`).
   * Idempotent against redelivery: a given (userId, lessonId) ActivityEvent
   * is only recorded once. Recomputes the full CourseProgress row
   * (completion %, streak) and publishes CourseCompleted when completion
   * reaches exactly 100% for the first time.
   */
  async recalculateForLessonCompleted(payload: LessonCompletedEvent): Promise<void> {
    const alreadyRecorded = await this.prisma.activityEvent.findFirst({
      where: {
        userId: payload.userId,
        lessonId: payload.lessonId,
        type: ActivityType.LESSON_COMPLETED,
      },
    });

    if (!alreadyRecorded) {
      await this.prisma.activityEvent.create({
        data: {
          userId: payload.userId,
          courseId: payload.courseId,
          lessonId: payload.lessonId,
          type: ActivityType.LESSON_COMPLETED,
          occurredAt: new Date(payload.occurredAt),
        },
      });
    }

    await this.recomputeCourseProgress(payload.userId, payload.courseId);
  }

  private async recomputeCourseProgress(userId: string, courseId: string): Promise<void> {
    const totalLessons = await this.countTotalLessons(courseId);

    const distinctLessonRows = await this.prisma.activityEvent.findMany({
      where: { userId, courseId, type: ActivityType.LESSON_COMPLETED },
      select: { lessonId: true },
      distinct: ['lessonId'],
    });
    const lessonsCompleted = distinctLessonRows.filter((row) => row.lessonId !== null).length;
    const completionPercent = totalLessons > 0 ? (lessonsCompleted / totalLessons) * 100 : 0;

    const streak = await this.computeCourseStreak(userId, courseId);
    const existing = await this.prisma.courseProgress.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });

    await this.prisma.courseProgress.upsert({
      where: { userId_courseId: { userId, courseId } },
      create: {
        userId,
        courseId,
        completionPercent,
        lessonsCompleted,
        totalLessons,
        currentStreakDays: streak.currentStreakDays,
        longestStreakDays: streak.longestStreakDays,
        lastActivityDate: streak.lastActivityDate,
      },
      update: {
        completionPercent,
        lessonsCompleted,
        totalLessons,
        currentStreakDays: streak.currentStreakDays,
        longestStreakDays: streak.longestStreakDays,
        lastActivityDate: streak.lastActivityDate,
      },
    });

    // Only publish on the transition into 100% (guards against redelivery /
    // repeated recompute once already complete from double-publishing).
    const wasAlreadyComplete = existing?.completionPercent === 100;
    if (totalLessons > 0 && completionPercent === 100 && !wasAlreadyComplete) {
      const event: CourseCompletedEvent = {
        userId,
        courseId,
        occurredAt: new Date().toISOString(),
      };
      await this.amqpConnection.publish(EVENT_EXCHANGE, RoutingKeys.COURSE_COMPLETED, event);
    }
  }

  /** Refreshes only the streak fields on an existing/new CourseProgress row. */
  private async syncCourseStreak(userId: string, courseId: string): Promise<void> {
    const streak = await this.computeCourseStreak(userId, courseId);
    const existing = await this.prisma.courseProgress.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });

    if (existing) {
      await this.prisma.courseProgress.update({
        where: { userId_courseId: { userId, courseId } },
        data: {
          currentStreakDays: streak.currentStreakDays,
          longestStreakDays: streak.longestStreakDays,
          lastActivityDate: streak.lastActivityDate,
        },
      });
    } else {
      const totalLessons = await this.countTotalLessons(courseId);
      await this.prisma.courseProgress.create({
        data: {
          userId,
          courseId,
          completionPercent: 0,
          lessonsCompleted: 0,
          totalLessons,
          currentStreakDays: streak.currentStreakDays,
          longestStreakDays: streak.longestStreakDays,
          lastActivityDate: streak.lastActivityDate,
        },
      });
    }
  }

  private async computeCourseStreak(userId: string, courseId: string) {
    const events = await this.prisma.activityEvent.findMany({
      where: { userId, courseId },
      select: { occurredAt: true },
    });
    return computeStreak(events.map((e) => e.occurredAt));
  }

  private async countTotalLessons(courseId: string): Promise<number> {
    return this.prisma.lesson.count({ where: { module: { courseId } } });
  }

  // ---------------------------------------------------------------------
  // Manual full recompute (no broker dependency; usable by tests / an
  // eventual admin tool).
  // ---------------------------------------------------------------------

  /**
   * Rebuilds StudentProgress from scratch off the user's submitted
   * QuizAttempts (grouped by topic, EWMA re-applied attempt by attempt in
   * chronological order) and rebuilds CourseProgress for every course the
   * user has any ActivityEvent in.
   */
  async recalculateForUser(userId: string): Promise<void> {
    const attempts = await this.prisma.quizAttempt.findMany({
      where: { userId, status: AttemptStatus.SUBMITTED },
      include: { answers: { include: { question: true } } },
      orderBy: { submittedAt: 'asc' },
    });

    const samplesByTopic = new Map<string, { correct: number; total: number }[]>();
    for (const attempt of attempts) {
      const perTopic = new Map<string, { correct: number; total: number }>();
      for (const answer of attempt.answers) {
        const topicId = answer.question.topicId;
        const agg = perTopic.get(topicId) ?? { correct: 0, total: 0 };
        agg.total += 1;
        if (answer.isCorrect) {
          agg.correct += 1;
        }
        perTopic.set(topicId, agg);
      }
      for (const [topicId, agg] of perTopic) {
        const list = samplesByTopic.get(topicId) ?? [];
        list.push(agg);
        samplesByTopic.set(topicId, list);
      }
    }

    for (const [topicId, samples] of samplesByTopic) {
      let mastery = 0;
      let attemptsCount = 0;
      let correctCount = 0;
      for (const sample of samples) {
        const sampleScore = sample.total > 0 ? (sample.correct / sample.total) * 100 : 0;
        mastery =
          attemptsCount === 0
            ? sampleScore
            : mastery * (1 - MASTERY_EWMA_ALPHA) + sampleScore * MASTERY_EWMA_ALPHA;
        attemptsCount += 1;
        correctCount += sample.correct;
      }

      await this.prisma.studentProgress.upsert({
        where: { userId_topicId: { userId, topicId } },
        create: {
          userId,
          topicId,
          masteryScore: mastery,
          attemptsCount,
          correctCount,
          lastActivityAt: new Date(),
        },
        update: {
          masteryScore: mastery,
          attemptsCount,
          correctCount,
          lastActivityAt: new Date(),
        },
      });
    }

    const courseRows = await this.prisma.activityEvent.findMany({
      where: { userId, courseId: { not: null } },
      select: { courseId: true },
      distinct: ['courseId'],
    });
    for (const { courseId } of courseRows) {
      if (courseId) {
        await this.recomputeCourseProgress(userId, courseId);
      }
    }
  }

  // ---------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------

  /**
   * The "overall" streak shown on /progress/me is computed globally across
   * ALL of the user's ActivityEvent rows (not per-course, and not a max
   * across courses) — chosen because a student who alternates between two
   * courses on consecutive days is still "keeping a streak" in any
   * reasonable sense, and a global figure is simpler to reason about than
   * "max across courses" while being strictly more generous/accurate.
   */
  async getSummaryForUser(userId: string): Promise<ProgressSummaryDto> {
    const [topicRows, courseRows, events] = await Promise.all([
      this.prisma.studentProgress.findMany({
        where: { userId },
        include: { topic: true },
        orderBy: { lastActivityAt: 'desc' },
      }),
      this.prisma.courseProgress.findMany({ where: { userId } }),
      this.prisma.activityEvent.findMany({ where: { userId }, select: { occurredAt: true } }),
    ]);

    const globalStreak = computeStreak(events.map((e) => e.occurredAt));

    return {
      topics: topicRows.map((row) => ({
        topicId: row.topicId,
        topicName: row.topic.name,
        masteryScore: row.masteryScore,
        attemptsCount: row.attemptsCount,
        lastActivityAt: row.lastActivityAt.toISOString(),
      })),
      courses: courseRows.map((row) => ({
        courseId: row.courseId,
        completionPercent: row.completionPercent,
        lessonsCompleted: row.lessonsCompleted,
        totalLessons: row.totalLessons,
        currentStreakDays: row.currentStreakDays,
        longestStreakDays: row.longestStreakDays,
      })),
      currentStreakDays: globalStreak.currentStreakDays,
      longestStreakDays: globalStreak.longestStreakDays,
    };
  }

  async getCourseProgress(userId: string, courseId: string) {
    const row = await this.prisma.courseProgress.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    if (!row) {
      throw new NotFoundException('No progress recorded for this course yet');
    }
    return {
      courseId: row.courseId,
      completionPercent: row.completionPercent,
      lessonsCompleted: row.lessonsCompleted,
      totalLessons: row.totalLessons,
      currentStreakDays: row.currentStreakDays,
      longestStreakDays: row.longestStreakDays,
    };
  }

  async getTopicProgress(userId: string, topicId: string) {
    const row = await this.prisma.studentProgress.findUnique({
      where: { userId_topicId: { userId, topicId } },
      include: { topic: true },
    });
    if (!row) {
      throw new NotFoundException('No progress recorded for this topic yet');
    }
    return {
      topicId: row.topicId,
      topicName: row.topic.name,
      masteryScore: row.masteryScore,
      attemptsCount: row.attemptsCount,
      lastActivityAt: row.lastActivityAt.toISOString(),
    };
  }
}
