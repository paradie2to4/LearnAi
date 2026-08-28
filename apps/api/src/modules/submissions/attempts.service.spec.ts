import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { AttemptStatus, QuestionType, Role } from '@learnai/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AttemptsService } from './attempts.service';
import { ScoringService } from './scoring.service';

describe('AttemptsService', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let amqpConnection: AmqpConnection;
  let service: AttemptsService;

  const owner = { userId: 'student-1', email: 'student@example.com', role: Role.STUDENT };
  const otherStudent = { userId: 'student-2', email: 'other@example.com', role: Role.STUDENT };
  const admin = { userId: 'admin-1', email: 'admin@example.com', role: Role.ADMIN };
  const owningInstructor = { userId: 'instructor-1', email: 'instructor@example.com', role: Role.INSTRUCTOR };
  const otherInstructor = { userId: 'instructor-2', email: 'instructor2@example.com', role: Role.INSTRUCTOR };

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    amqpConnection = { publish: jest.fn() } as unknown as AmqpConnection;
    // ScoringService is pure, so using the real implementation here means
    // these tests exercise the actual orchestration wiring, not a stub.
    service = new AttemptsService(prisma, new ScoringService(), amqpConnection);

    // Interactive transactions: run the callback against the same mocked client.
    (prisma.$transaction as unknown as jest.Mock).mockImplementation((cb: any) =>
      typeof cb === 'function' ? cb(prisma) : Promise.all(cb),
    );
  });

  describe('startAttempt', () => {
    it('returns the existing IN_PROGRESS attempt instead of creating a duplicate', async () => {
      const existing = {
        id: 'attempt-1',
        userId: owner.userId,
        quizId: 'quiz-1',
        status: AttemptStatus.IN_PROGRESS,
      };
      prisma.quizAttempt.findFirst.mockResolvedValue(existing as any);

      const result = await service.startAttempt('quiz-1', owner);

      expect(result).toBe(existing);
      expect(prisma.quizAttempt.create).not.toHaveBeenCalled();
    });

    it('creates a new attempt when none is in progress and the quiz is published', async () => {
      prisma.quizAttempt.findFirst.mockResolvedValue(null);
      prisma.quiz.findUnique.mockResolvedValue({ id: 'quiz-1', isPublished: true } as any);
      prisma.quizAttempt.create.mockResolvedValue({ id: 'attempt-new' } as any);

      const result = await service.startAttempt('quiz-1', owner);

      expect(prisma.quizAttempt.create).toHaveBeenCalledWith({
        data: { userId: owner.userId, quizId: 'quiz-1' },
      });
      expect(result).toEqual({ id: 'attempt-new' });
    });
  });

  describe('saveAnswer', () => {
    it('rejects a non-owner', async () => {
      prisma.quizAttempt.findUnique.mockResolvedValue({
        id: 'attempt-1',
        userId: owner.userId,
        quizId: 'quiz-1',
        status: AttemptStatus.IN_PROGRESS,
      } as any);

      await expect(
        service.saveAnswer('attempt-1', { questionId: 'q-1', selectedOptionIds: ['opt-1'] }, otherStudent),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects modifying answers on an attempt that is not in progress', async () => {
      prisma.quizAttempt.findUnique.mockResolvedValue({
        id: 'attempt-1',
        userId: owner.userId,
        quizId: 'quiz-1',
        status: AttemptStatus.SUBMITTED,
      } as any);

      await expect(
        service.saveAnswer('attempt-1', { questionId: 'q-1', selectedOptionIds: ['opt-1'] }, owner),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws NotFoundException for a missing attempt', async () => {
      prisma.quizAttempt.findUnique.mockResolvedValue(null);

      await expect(service.saveAnswer('missing', { questionId: 'q-1' }, owner)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('submit', () => {
    const buildAttempt = (status: AttemptStatus) => ({
      id: 'attempt-1',
      userId: owner.userId,
      quizId: 'quiz-1',
      status,
      answers: [{ questionId: 'q-1', selectedOptionIds: ['opt-correct'], answerText: null }],
      quiz: {
        id: 'quiz-1',
        courseId: 'course-1',
        lessonId: null,
        passingScore: 70,
        partialCreditMultiAnswer: true,
        questions: [
          {
            id: 'q-1',
            type: QuestionType.MULTIPLE_CHOICE,
            points: 10,
            topicId: 'topic-1',
            correctAnswerText: null,
            acceptableAnswers: [],
            options: [
              { id: 'opt-correct', isCorrect: true },
              { id: 'opt-wrong', isCorrect: false },
            ],
          },
        ],
      },
    });

    it('rejects a non-owner', async () => {
      prisma.quizAttempt.findUnique.mockResolvedValue(buildAttempt(AttemptStatus.IN_PROGRESS) as any);

      await expect(service.submit('attempt-1', otherStudent)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws BadRequestException and does not re-score an already-SUBMITTED attempt', async () => {
      prisma.quizAttempt.findUnique.mockResolvedValue(buildAttempt(AttemptStatus.SUBMITTED) as any);

      await expect(service.submit('attempt-1', owner)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('scores, persists, and returns the result for a valid in-progress attempt', async () => {
      prisma.quizAttempt.findUnique.mockResolvedValue(buildAttempt(AttemptStatus.IN_PROGRESS) as any);
      prisma.quizAttempt.update.mockResolvedValue({
        id: 'attempt-1',
        quizId: 'quiz-1',
        status: AttemptStatus.SUBMITTED,
        startedAt: new Date(),
        submittedAt: new Date(),
        score: 10,
        maxScore: 10,
        passed: true,
      } as any);
      prisma.answerSubmission.upsert.mockResolvedValue({} as any);

      const result = await service.submit('attempt-1', owner);

      expect(result.score).toBe(10);
      expect(result.maxScore).toBe(10);
      expect(result.passed).toBe(true);
      expect(result.answers).toEqual([{ questionId: 'q-1', isCorrect: true, pointsAwarded: 10 }]);
      expect(prisma.quizAttempt.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'attempt-1' },
          data: expect.objectContaining({
            status: AttemptStatus.SUBMITTED,
            score: 10,
            maxScore: 10,
            passed: true,
          }),
        }),
      );
      // Best-effort event publish should have fired (fire-and-forget, not awaited by the caller).
      expect(amqpConnection.publish).toHaveBeenCalled();
    });

    it('never lets a broker failure fail the submit call', async () => {
      prisma.quizAttempt.findUnique.mockResolvedValue(buildAttempt(AttemptStatus.IN_PROGRESS) as any);
      prisma.quizAttempt.update.mockResolvedValue({
        id: 'attempt-1',
        quizId: 'quiz-1',
        status: AttemptStatus.SUBMITTED,
        startedAt: new Date(),
        submittedAt: new Date(),
        score: 10,
        maxScore: 10,
        passed: true,
      } as any);
      prisma.answerSubmission.upsert.mockResolvedValue({} as any);
      (amqpConnection.publish as jest.Mock).mockImplementation(() => {
        throw new Error('broker unreachable');
      });

      await expect(service.submit('attempt-1', owner)).resolves.toMatchObject({ score: 10 });
    });
  });

  describe('getAttempt', () => {
    const buildAttempt = (overrides: Partial<{ userId: string; status: AttemptStatus }> = {}) => ({
      id: 'attempt-1',
      userId: overrides.userId ?? owner.userId,
      quizId: 'quiz-1',
      status: overrides.status ?? AttemptStatus.SUBMITTED,
      startedAt: new Date(),
      submittedAt: new Date(),
      score: 10,
      maxScore: 10,
      passed: true,
      answers: [
        {
          questionId: 'q-1',
          selectedOptionIds: ['opt-correct'],
          answerText: null,
          isCorrect: true,
          pointsAwarded: 10,
        },
      ],
      quiz: {
        id: 'quiz-1',
        courseId: 'course-1',
        lessonId: null,
        questions: [
          {
            id: 'q-1',
            explanation: 'Because reasons',
            correctAnswerText: null,
            options: [
              { id: 'opt-correct', isCorrect: true },
              { id: 'opt-wrong', isCorrect: false },
            ],
          },
        ],
      },
    });

    it('allows the owner to view their own attempt', async () => {
      prisma.quizAttempt.findUnique.mockResolvedValue(buildAttempt() as any);

      const result = await service.getAttempt('attempt-1', owner);
      expect(result.id).toBe('attempt-1');
      expect(result.answers[0].correctOptionIds).toEqual(['opt-correct']);
    });

    it('rejects a non-owner student', async () => {
      prisma.quizAttempt.findUnique.mockResolvedValue(buildAttempt() as any);

      await expect(service.getAttempt('attempt-1', otherStudent)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows an ADMIN to view any attempt', async () => {
      prisma.quizAttempt.findUnique.mockResolvedValue(buildAttempt() as any);

      const result = await service.getAttempt('attempt-1', admin);
      expect(result.id).toBe('attempt-1');
    });

    it('allows the owning instructor to view the attempt', async () => {
      prisma.quizAttempt.findUnique.mockResolvedValue(buildAttempt() as any);
      prisma.course.findUnique.mockResolvedValue({
        id: 'course-1',
        instructorId: owningInstructor.userId,
      } as any);

      const result = await service.getAttempt('attempt-1', owningInstructor);
      expect(result.id).toBe('attempt-1');
    });

    it('rejects a non-owning instructor', async () => {
      prisma.quizAttempt.findUnique.mockResolvedValue(buildAttempt() as any);
      prisma.course.findUnique.mockResolvedValue({
        id: 'course-1',
        instructorId: owningInstructor.userId,
      } as any);

      await expect(service.getAttempt('attempt-1', otherInstructor)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('does not reveal the answer key while the attempt is still IN_PROGRESS', async () => {
      prisma.quizAttempt.findUnique.mockResolvedValue(
        buildAttempt({ status: AttemptStatus.IN_PROGRESS }) as any,
      );

      const result = await service.getAttempt('attempt-1', owner);
      expect(result.answers[0]).not.toHaveProperty('correctOptionIds');
      expect(result.answers[0]).not.toHaveProperty('explanation');
    });
  });
});
