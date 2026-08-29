import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { DraftStatus, QuestionType } from '@learnai/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { assertIsOwnerOrAdmin, resolveOwningInstructorId } from '../quizzes/quiz-ownership.util';
import { AiProvider, GeneratedQuestion } from './ai-provider.interface';
import { AI_PROVIDER } from './ai.constants';
import { GenerateQuestionsDto, QuestionDifficulty } from './dto/generate-questions.dto';
import { wrapAiCall } from './wrap-ai-call.util';

/** How many lesson excerpts to pull as grounding content for a given topic. */
const MAX_GROUNDING_LESSONS = 2;
/** Lesson content is stored as full HTML/markdown; truncate excerpts so the prompt stays bounded. */
const GROUNDING_EXCERPT_MAX_CHARS = 1500;

const DEFAULT_DIFFICULTY: QuestionDifficulty = 'MEDIUM';

@Injectable()
export class AiQuestionGenerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Inject(AI_PROVIDER) private readonly aiProvider: AiProvider,
  ) {}

  async generateDraftQuestions(requestedById: string, dto: GenerateQuestionsDto, user: AuthenticatedUser) {
    const topic = await this.prisma.topic.findUnique({
      where: { id: dto.topicId },
      include: { subject: true },
    });
    if (!topic) {
      throw new NotFoundException('Topic not found');
    }

    if (dto.quizId) {
      const quiz = await this.prisma.quiz.findUnique({ where: { id: dto.quizId } });
      if (!quiz) {
        throw new NotFoundException('Quiz not found');
      }
      const instructorId = await resolveOwningInstructorId(this.prisma, quiz);
      assertIsOwnerOrAdmin(instructorId, user);
    }

    const groundingLessons = await this.prisma.lesson.findMany({
      where: { topicId: dto.topicId },
      take: MAX_GROUNDING_LESSONS,
      select: { content: true },
    });
    const groundingContent = groundingLessons.map((lesson) =>
      lesson.content.slice(0, GROUNDING_EXCERPT_MAX_CHARS),
    );

    const generated = await wrapAiCall(
      () =>
        this.aiProvider.generateQuizQuestions({
          subject: topic.subject.name,
          topicName: topic.name,
          difficulty: dto.difficulty ?? DEFAULT_DIFFICULTY,
          count: dto.count,
          questionTypes: dto.questionType ? [dto.questionType] : undefined,
          groundingContent: groundingContent.length > 0 ? groundingContent : undefined,
        }),
      'AI question generation is temporarily unavailable.',
    );

    const sourceModel = this.configService.get<string>('AI_MODEL_ID') ?? 'gemini-1.5-flash';

    const drafts = await Promise.all(
      generated.map((question) =>
        this.prisma.aiGeneratedQuestionDraft.create({
          data: {
            quizId: dto.quizId ?? null,
            topicId: dto.topicId,
            requestedById,
            type: question.type,
            prompt: question.prompt,
            optionsJson: this.toOptionsJson(question) as Prisma.InputJsonValue,
            explanation: question.explanation,
            sourceModel,
            status: DraftStatus.PENDING,
          },
        }),
      ),
    );

    return drafts;
  }

  /** Persists everything needed to later publish the draft as a real Question, keyed by type. */
  private toOptionsJson(question: GeneratedQuestion): Record<string, unknown> {
    if (question.type === QuestionType.SHORT_ANSWER) {
      return {
        correctAnswerText: question.correctAnswerText ?? '',
        acceptableAnswers: question.acceptableAnswers ?? [],
      };
    }
    return {
      options: question.options.map((option, index) => ({
        text: option.text,
        isCorrect: option.isCorrect,
        order: index,
      })),
    };
  }
}
