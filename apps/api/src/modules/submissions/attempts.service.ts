import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { AttemptStatus, EVENT_EXCHANGE, QuizCompletedEvent, Role, RoutingKeys } from '@learnai/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { resolveOwningInstructorId } from '../quizzes/quiz-ownership.util';
import { ScoringQuestion, ScoringService, ScoringSubmission } from './scoring.service';
import { SubmitAnswerDto } from './dto/submit-answer.dto';

@Injectable()
export class AttemptsService {
  private readonly logger = new Logger(AttemptsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scoringService: ScoringService,
    private readonly amqpConnection: AmqpConnection,
  ) {}

  /** Starts an attempt, or returns the caller's existing IN_PROGRESS one for this quiz (app-level uniqueness). */
  async startAttempt(quizId: string, user: AuthenticatedUser) {
    const existing = await this.prisma.quizAttempt.findFirst({
      where: { userId: user.userId, quizId, status: AttemptStatus.IN_PROGRESS },
    });
    if (existing) {
      return existing;
    }

    const quiz = await this.prisma.quiz.findUnique({ where: { id: quizId } });
    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }
    if (!quiz.isPublished) {
      throw new BadRequestException('Cannot start an attempt on an unpublished quiz');
    }

    return this.prisma.quizAttempt.create({
      data: { userId: user.userId, quizId },
    });
  }

  /** Autosave-style upsert of a single answer. Owner-only, and only while the attempt is IN_PROGRESS. */
  async saveAnswer(attemptId: string, dto: SubmitAnswerDto, user: AuthenticatedUser) {
    const attempt = await this.prisma.quizAttempt.findUnique({ where: { id: attemptId } });
    if (!attempt) {
      throw new NotFoundException('Attempt not found');
    }
    if (attempt.userId !== user.userId) {
      throw new ForbiddenException('You do not own this attempt');
    }
    if (attempt.status !== AttemptStatus.IN_PROGRESS) {
      throw new BadRequestException('Cannot modify answers on an attempt that is not in progress');
    }

    const question = await this.prisma.question.findUnique({ where: { id: dto.questionId } });
    if (!question || question.quizId !== attempt.quizId) {
      throw new BadRequestException("Question does not belong to this attempt's quiz");
    }

    return this.prisma.answerSubmission.upsert({
      where: { attemptId_questionId: { attemptId, questionId: dto.questionId } },
      create: {
        attemptId,
        questionId: dto.questionId,
        selectedOptionIds: dto.selectedOptionIds ?? [],
        answerText: dto.answerText,
      },
      update: {
        selectedOptionIds: dto.selectedOptionIds ?? [],
        answerText: dto.answerText,
      },
    });
  }

  /**
   * Scores and finalizes an attempt. Owner-only; rejects if already
   * submitted (no re-scoring). The DB transaction + HTTP response is fully
   * synchronous; the QuizCompleted/AssessmentSubmitted publish happens only
   * after the transaction resolves and is best-effort — a broker failure
   * never fails the request, it's only logged.
   */
  async submit(attemptId: string, user: AuthenticatedUser) {
    const attempt = await this.prisma.quizAttempt.findUnique({
      where: { id: attemptId },
      include: {
        answers: true,
        quiz: { include: { questions: { include: { options: true } } } },
      },
    });
    if (!attempt) {
      throw new NotFoundException('Attempt not found');
    }
    if (attempt.userId !== user.userId) {
      throw new ForbiddenException('You do not own this attempt');
    }
    if (attempt.status === AttemptStatus.SUBMITTED) {
      throw new BadRequestException('This attempt has already been submitted');
    }
    if (attempt.status !== AttemptStatus.IN_PROGRESS) {
      throw new BadRequestException(`Cannot submit an attempt with status ${attempt.status}`);
    }

    const scoringQuestions: ScoringQuestion[] = attempt.quiz.questions.map((q) => ({
      id: q.id,
      type: q.type,
      points: q.points,
      topicId: q.topicId,
      options: q.options.map((o) => ({ id: o.id, isCorrect: o.isCorrect })),
      correctAnswerText: q.correctAnswerText,
      acceptableAnswers: q.acceptableAnswers,
    }));
    const scoringSubmissions: ScoringSubmission[] = attempt.answers.map((a) => ({
      questionId: a.questionId,
      selectedOptionIds: a.selectedOptionIds,
      answerText: a.answerText,
    }));

    const scored = this.scoringService.scoreAttempt(
      scoringQuestions,
      scoringSubmissions,
      attempt.quiz.passingScore,
      attempt.quiz.partialCreditMultiAnswer,
    );

    const submittedAt = new Date();
    const submissionByQuestionId = new Map(scoringSubmissions.map((s) => [s.questionId, s]));

    const updatedAttempt = await this.prisma.$transaction(async (tx) => {
      const result = await tx.quizAttempt.update({
        where: { id: attemptId },
        data: {
          status: AttemptStatus.SUBMITTED,
          submittedAt,
          score: scored.score,
          maxScore: scored.maxScore,
          passed: scored.passed,
        },
      });

      await Promise.all(
        scored.results.map((r) => {
          const existing = submissionByQuestionId.get(r.questionId);
          return tx.answerSubmission.upsert({
            where: { attemptId_questionId: { attemptId, questionId: r.questionId } },
            create: {
              attemptId,
              questionId: r.questionId,
              selectedOptionIds: existing?.selectedOptionIds ?? [],
              answerText: existing?.answerText ?? null,
              isCorrect: r.isCorrect,
              pointsAwarded: r.pointsAwarded,
            },
            update: {
              isCorrect: r.isCorrect,
              pointsAwarded: r.pointsAwarded,
            },
          });
        }),
      );

      return result;
    });

    const response = {
      id: updatedAttempt.id,
      quizId: updatedAttempt.quizId,
      status: updatedAttempt.status,
      startedAt: updatedAttempt.startedAt,
      submittedAt: updatedAttempt.submittedAt,
      score: updatedAttempt.score,
      maxScore: updatedAttempt.maxScore,
      passed: updatedAttempt.passed,
      answers: scored.results,
    };

    // Best-effort enrichment only, fired after the response payload is
    // already fully computed. Never allowed to fail the submit request.
    this.publishCompletionEvents(
      { userId: attempt.userId, quizId: attempt.quizId, id: attempt.id, quiz: attempt.quiz },
      scored,
      scoringQuestions,
      submittedAt,
    );

    return response;
  }

  private publishCompletionEvents(
    attempt: {
      userId: string;
      quizId: string;
      id: string;
      quiz: { courseId: string | null; lessonId: string | null };
    },
    scored: {
      score: number;
      maxScore: number;
      passed: boolean;
      results: { questionId: string; isCorrect: boolean }[];
    },
    questions: ScoringQuestion[],
    occurredAt: Date,
  ): void {
    try {
      const topicByQuestionId = new Map(questions.map((q) => [q.id, q.topicId]));
      const breakdownByTopic = new Map<string, { correct: number; total: number }>();

      for (const result of scored.results) {
        const topicId = topicByQuestionId.get(result.questionId);
        if (!topicId) continue;
        const entry = breakdownByTopic.get(topicId) ?? { correct: 0, total: 0 };
        entry.total += 1;
        if (result.isCorrect) entry.correct += 1;
        breakdownByTopic.set(topicId, entry);
      }

      const topicBreakdown = [...breakdownByTopic.entries()].map(([topicId, v]) => ({ topicId, ...v }));
      const isFinalAssessment = !attempt.quiz.lessonId;

      const payload: QuizCompletedEvent = {
        userId: attempt.userId,
        quizId: attempt.quizId,
        attemptId: attempt.id,
        courseId: attempt.quiz.courseId,
        isFinalAssessment,
        topicBreakdown,
        score: scored.score,
        maxScore: scored.maxScore,
        passed: scored.passed,
        occurredAt: occurredAt.toISOString(),
      };

      this.amqpConnection.publish(EVENT_EXCHANGE, RoutingKeys.QUIZ_COMPLETED, payload);
      if (isFinalAssessment) {
        this.amqpConnection.publish(EVENT_EXCHANGE, RoutingKeys.ASSESSMENT_SUBMITTED, payload);
      }
    } catch (err) {
      this.logger.error(`Failed to publish quiz completion events for attempt ${attempt.id}`, err as Error);
    }
  }

  /** Owner, or the owning instructor/ADMIN, can view. Full answer key is only revealed once SUBMITTED. */
  async getAttempt(attemptId: string, user: AuthenticatedUser) {
    const attempt = await this.prisma.quizAttempt.findUnique({
      where: { id: attemptId },
      include: {
        answers: true,
        quiz: { include: { questions: { include: { options: true } } } },
      },
    });
    if (!attempt) {
      throw new NotFoundException('Attempt not found');
    }

    if (attempt.userId !== user.userId) {
      if (user.role === Role.ADMIN) {
        // allowed
      } else if (user.role === Role.INSTRUCTOR) {
        const instructorId = await resolveOwningInstructorId(this.prisma, attempt.quiz);
        if (instructorId !== user.userId) {
          throw new ForbiddenException('You do not have access to this attempt');
        }
      } else {
        throw new ForbiddenException('You do not have access to this attempt');
      }
    }

    const revealAnswerKey = attempt.status === AttemptStatus.SUBMITTED;
    const answersByQuestionId = new Map(attempt.answers.map((a) => [a.questionId, a]));

    return {
      id: attempt.id,
      quizId: attempt.quizId,
      status: attempt.status,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      score: attempt.score,
      maxScore: attempt.maxScore,
      passed: attempt.passed,
      answers: attempt.quiz.questions.map((q) => {
        const a = answersByQuestionId.get(q.id);
        return {
          questionId: q.id,
          isCorrect: a?.isCorrect ?? false,
          pointsAwarded: a?.pointsAwarded ?? 0,
          ...(revealAnswerKey
            ? {
                correctOptionIds: q.options.filter((o) => o.isCorrect).map((o) => o.id),
                correctAnswerText: q.correctAnswerText ?? undefined,
                explanation: q.explanation,
              }
            : {}),
        };
      }),
    };
  }
}
