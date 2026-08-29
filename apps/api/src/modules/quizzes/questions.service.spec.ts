import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { QuestionType, Role } from '@learnai/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { QuestionsService } from './questions.service';

describe('QuestionsService.validateInvariant', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let service: QuestionsService;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = new QuestionsService(prisma);
  });

  describe('MULTIPLE_CHOICE', () => {
    it('accepts exactly one correct option', () => {
      expect(() =>
        service.validateInvariant(
          QuestionType.MULTIPLE_CHOICE,
          [{ isCorrect: false }, { isCorrect: true }, { isCorrect: false }],
          undefined,
        ),
      ).not.toThrow();
    });

    it('rejects zero correct options', () => {
      expect(() =>
        service.validateInvariant(
          QuestionType.MULTIPLE_CHOICE,
          [{ isCorrect: false }, { isCorrect: false }],
          undefined,
        ),
      ).toThrow(BadRequestException);
    });

    it('rejects more than one correct option', () => {
      expect(() =>
        service.validateInvariant(
          QuestionType.MULTIPLE_CHOICE,
          [{ isCorrect: true }, { isCorrect: true }],
          undefined,
        ),
      ).toThrow(BadRequestException);
    });

    it('rejects a missing/empty options array', () => {
      expect(() => service.validateInvariant(QuestionType.MULTIPLE_CHOICE, undefined, undefined)).toThrow(
        BadRequestException,
      );
      expect(() => service.validateInvariant(QuestionType.MULTIPLE_CHOICE, [], undefined)).toThrow(
        BadRequestException,
      );
    });
  });

  describe('TRUE_FALSE', () => {
    it('accepts exactly two options with exactly one correct', () => {
      expect(() =>
        service.validateInvariant(
          QuestionType.TRUE_FALSE,
          [{ isCorrect: true }, { isCorrect: false }],
          undefined,
        ),
      ).not.toThrow();
    });

    it('rejects fewer than two options', () => {
      expect(() =>
        service.validateInvariant(QuestionType.TRUE_FALSE, [{ isCorrect: true }], undefined),
      ).toThrow(BadRequestException);
    });

    it('rejects more than two options', () => {
      expect(() =>
        service.validateInvariant(
          QuestionType.TRUE_FALSE,
          [{ isCorrect: true }, { isCorrect: false }, { isCorrect: false }],
          undefined,
        ),
      ).toThrow(BadRequestException);
    });

    it('rejects two options with zero or two marked correct', () => {
      expect(() =>
        service.validateInvariant(
          QuestionType.TRUE_FALSE,
          [{ isCorrect: false }, { isCorrect: false }],
          undefined,
        ),
      ).toThrow(BadRequestException);
      expect(() =>
        service.validateInvariant(
          QuestionType.TRUE_FALSE,
          [{ isCorrect: true }, { isCorrect: true }],
          undefined,
        ),
      ).toThrow(BadRequestException);
    });
  });

  describe('MULTIPLE_ANSWER', () => {
    it('accepts at least one correct option', () => {
      expect(() =>
        service.validateInvariant(
          QuestionType.MULTIPLE_ANSWER,
          [{ isCorrect: true }, { isCorrect: false }, { isCorrect: true }],
          undefined,
        ),
      ).not.toThrow();
    });

    it('accepts all options marked correct', () => {
      expect(() =>
        service.validateInvariant(
          QuestionType.MULTIPLE_ANSWER,
          [{ isCorrect: true }, { isCorrect: true }],
          undefined,
        ),
      ).not.toThrow();
    });

    it('rejects zero correct options', () => {
      expect(() =>
        service.validateInvariant(
          QuestionType.MULTIPLE_ANSWER,
          [{ isCorrect: false }, { isCorrect: false }],
          undefined,
        ),
      ).toThrow(BadRequestException);
    });

    it('rejects a missing/empty options array', () => {
      expect(() => service.validateInvariant(QuestionType.MULTIPLE_ANSWER, undefined, undefined)).toThrow(
        BadRequestException,
      );
      expect(() => service.validateInvariant(QuestionType.MULTIPLE_ANSWER, [], undefined)).toThrow(
        BadRequestException,
      );
    });
  });

  describe('SHORT_ANSWER', () => {
    it('accepts a non-empty correctAnswerText', () => {
      expect(() => service.validateInvariant(QuestionType.SHORT_ANSWER, undefined, 'Paris')).not.toThrow();
    });

    it('rejects a missing correctAnswerText', () => {
      expect(() => service.validateInvariant(QuestionType.SHORT_ANSWER, undefined, undefined)).toThrow(
        BadRequestException,
      );
    });

    it('rejects an empty/whitespace-only correctAnswerText', () => {
      expect(() => service.validateInvariant(QuestionType.SHORT_ANSWER, undefined, '')).toThrow(
        BadRequestException,
      );
      expect(() => service.validateInvariant(QuestionType.SHORT_ANSWER, undefined, '   ')).toThrow(
        BadRequestException,
      );
    });
  });
});

describe('QuestionsService.create', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let service: QuestionsService;

  const owningInstructor: AuthenticatedUser = {
    userId: 'instructor-1',
    email: 'owner@example.com',
    role: Role.INSTRUCTOR,
  };
  const quiz = { id: 'quiz-1', courseId: 'course-1', lessonId: null };
  const course = { id: 'course-1', instructorId: owningInstructor.userId };

  const validDto = {
    type: QuestionType.SHORT_ANSWER,
    prompt: 'Who moonwalked?',
    topicId: 'topic-1',
    order: 0,
    correctAnswerText: 'Michael Jackson',
  };

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = new QuestionsService(prisma);
    prisma.quiz.findUnique.mockResolvedValue(quiz as any);
    prisma.course.findUnique.mockResolvedValue(course as any);
  });

  it('throws NotFoundException instead of letting an invalid topicId hit the database as an unhandled FK error', async () => {
    prisma.topic.findUnique.mockResolvedValue(null);

    await expect(service.create(quiz.id, validDto as any, owningInstructor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.question.create).not.toHaveBeenCalled();
  });

  it('creates the question once the topic is confirmed to exist', async () => {
    prisma.topic.findUnique.mockResolvedValue({ id: 'topic-1', name: 'Pop Culture' } as any);
    prisma.question.create.mockResolvedValue({ id: 'question-1' } as any);

    const result = await service.create(quiz.id, validDto as any, owningInstructor);

    expect(prisma.question.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ topicId: 'topic-1' }) }),
    );
    expect(result).toEqual({ id: 'question-1' });
  });

  it('denies a non-owning instructor before ever checking the topic', async () => {
    prisma.course.findUnique.mockResolvedValue({ id: 'course-1', instructorId: 'someone-else' } as any);

    await expect(service.create(quiz.id, validDto as any, owningInstructor)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.topic.findUnique).not.toHaveBeenCalled();
    expect(prisma.question.create).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when the quiz does not exist', async () => {
    prisma.quiz.findUnique.mockResolvedValue(null);

    await expect(service.create('missing-quiz', validDto as any, owningInstructor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
