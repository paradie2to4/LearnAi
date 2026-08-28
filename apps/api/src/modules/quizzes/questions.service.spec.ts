import { BadRequestException } from '@nestjs/common';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { QuestionType } from '@learnai/shared';
import { PrismaService } from '../../prisma/prisma.service';
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
