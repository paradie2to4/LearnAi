import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { QuestionType } from '@learnai/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { assertIsOwnerOrAdmin, resolveOwningInstructorId } from './quiz-ownership.util';

interface OptionInvariantInput {
  isCorrect: boolean;
}

@Injectable()
export class QuestionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(quizId: string, dto: CreateQuestionDto, user: AuthenticatedUser) {
    const quiz = await this.prisma.quiz.findUnique({ where: { id: quizId } });
    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }
    await this.assertQuizOwnership(quiz, user);

    this.validateInvariant(dto.type, dto.options, dto.correctAnswerText);
    await this.assertTopicExists(dto.topicId);

    return this.prisma.question.create({
      data: {
        quizId,
        topicId: dto.topicId,
        type: dto.type,
        prompt: dto.prompt,
        points: dto.points ?? 1,
        order: dto.order,
        explanation: dto.explanation,
        correctAnswerText: dto.type === QuestionType.SHORT_ANSWER ? dto.correctAnswerText : null,
        acceptableAnswers: dto.type === QuestionType.SHORT_ANSWER ? (dto.acceptableAnswers ?? []) : [],
        options:
          dto.options && dto.options.length > 0
            ? { create: dto.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect, order: o.order })) }
            : undefined,
      },
      include: { options: true },
    });
  }

  async update(id: string, dto: UpdateQuestionDto, user: AuthenticatedUser) {
    const question = await this.prisma.question.findUnique({
      where: { id },
      include: { quiz: true, options: { orderBy: { order: 'asc' } } },
    });
    if (!question) {
      throw new NotFoundException('Question not found');
    }
    await this.assertQuizOwnership(question.quiz, user);

    // Validate the *effective* post-update state: fields not present in the
    // patch fall back to what's already persisted, so e.g. patching just
    // `points` on an existing MULTIPLE_CHOICE question still re-validates
    // its existing options rather than treating them as absent.
    const effectiveType = dto.type ?? question.type;
    const effectiveOptions: OptionInvariantInput[] | undefined =
      dto.options !== undefined ? dto.options : question.options;
    const effectiveCorrectAnswerText =
      dto.correctAnswerText !== undefined ? dto.correctAnswerText : (question.correctAnswerText ?? undefined);

    this.validateInvariant(effectiveType, effectiveOptions, effectiveCorrectAnswerText);
    if (dto.topicId !== undefined) {
      await this.assertTopicExists(dto.topicId);
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.options !== undefined) {
        await tx.questionOption.deleteMany({ where: { questionId: id } });
      }

      return tx.question.update({
        where: { id },
        data: {
          topicId: dto.topicId,
          type: dto.type,
          prompt: dto.prompt,
          points: dto.points,
          order: dto.order,
          explanation: dto.explanation,
          correctAnswerText: dto.correctAnswerText !== undefined ? dto.correctAnswerText : undefined,
          acceptableAnswers: dto.acceptableAnswers,
          options:
            dto.options !== undefined
              ? { create: dto.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect, order: o.order })) }
              : undefined,
        },
        include: { options: true },
      });
    });
  }

  async remove(id: string, user: AuthenticatedUser) {
    const question = await this.prisma.question.findUnique({ where: { id }, include: { quiz: true } });
    if (!question) {
      throw new NotFoundException('Question not found');
    }
    await this.assertQuizOwnership(question.quiz, user);

    await this.prisma.question.delete({ where: { id } });
    return { id };
  }

  /**
   * Service-level enforcement of the per-type authoring invariants (this is
   * the source of truth; DTO decorators only check shape). Runs identically
   * on create and update.
   */
  validateInvariant(
    type: QuestionType | string,
    options: OptionInvariantInput[] | undefined,
    correctAnswerText: string | undefined,
  ): void {
    switch (type) {
      case QuestionType.MULTIPLE_CHOICE: {
        if (!options || options.length === 0) {
          throw new BadRequestException('MULTIPLE_CHOICE questions require an options array');
        }
        const correctCount = options.filter((o) => o.isCorrect).length;
        if (correctCount !== 1) {
          throw new BadRequestException('MULTIPLE_CHOICE questions must have exactly one correct option');
        }
        break;
      }
      case QuestionType.TRUE_FALSE: {
        if (!options || options.length !== 2) {
          throw new BadRequestException('TRUE_FALSE questions must have exactly two options');
        }
        const correctCount = options.filter((o) => o.isCorrect).length;
        if (correctCount !== 1) {
          throw new BadRequestException('TRUE_FALSE questions must have exactly one correct option');
        }
        break;
      }
      case QuestionType.MULTIPLE_ANSWER: {
        if (!options || options.length === 0) {
          throw new BadRequestException('MULTIPLE_ANSWER questions require an options array');
        }
        const correctCount = options.filter((o) => o.isCorrect).length;
        if (correctCount < 1) {
          throw new BadRequestException('MULTIPLE_ANSWER questions must have at least one correct option');
        }
        break;
      }
      case QuestionType.SHORT_ANSWER: {
        if (!correctAnswerText || correctAnswerText.trim().length === 0) {
          throw new BadRequestException('SHORT_ANSWER questions require a non-empty correctAnswerText');
        }
        break;
      }
      default:
        throw new BadRequestException(`Unsupported question type: ${type as string}`);
    }
  }

  /** Turns an invalid topicId into a clean 404 instead of an unhandled FK-constraint 500 from Prisma. */
  private async assertTopicExists(topicId: string): Promise<void> {
    const topic = await this.prisma.topic.findUnique({ where: { id: topicId } });
    if (!topic) {
      throw new NotFoundException(`Topic not found: ${topicId}`);
    }
  }

  private async assertQuizOwnership(
    quiz: { courseId: string | null; lessonId: string | null },
    user: AuthenticatedUser,
  ) {
    const instructorId = await resolveOwningInstructorId(this.prisma, quiz);
    assertIsOwnerOrAdmin(instructorId, user);
  }
}
