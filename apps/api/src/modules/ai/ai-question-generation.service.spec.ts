import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { DraftStatus, QuestionType, Role } from '@learnai/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AiProvider } from './ai-provider.interface';
import { AiQuestionGenerationService } from './ai-question-generation.service';

describe('AiQuestionGenerationService', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let aiProvider: jest.Mocked<AiProvider>;
  let configService: ConfigService;
  let service: AiQuestionGenerationService;

  const instructor = { userId: 'instructor-1', email: 'i@example.com', role: Role.INSTRUCTOR };
  const otherInstructor = { userId: 'instructor-2', email: 'other@example.com', role: Role.INSTRUCTOR };

  const topic = { id: 'topic-1', name: 'Normalization', subject: { name: 'Databases' } };

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    aiProvider = {
      generateQuizQuestions: jest.fn(),
      explainIncorrectAnswer: jest.fn(),
      generateRecommendationNarrative: jest.fn(),
      answerStudyAssistantQuestion: jest.fn(),
    };
    configService = { get: jest.fn(() => 'claude-opus-5') } as unknown as ConfigService;
    service = new AiQuestionGenerationService(prisma, configService, aiProvider);
  });

  it('throws NotFoundException when the topic does not exist', async () => {
    prisma.topic.findUnique.mockResolvedValue(null);

    await expect(
      service.generateDraftQuestions(instructor.userId, { topicId: 'missing', count: 1 }, instructor),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('denies a non-owning instructor when a quizId is provided', async () => {
    prisma.topic.findUnique.mockResolvedValue(topic as any);
    prisma.quiz.findUnique.mockResolvedValue({ id: 'quiz-1', courseId: 'course-1', lessonId: null } as any);
    prisma.course.findUnique.mockResolvedValue({ id: 'course-1', instructorId: instructor.userId } as any);

    await expect(
      service.generateDraftQuestions(
        otherInstructor.userId,
        { topicId: topic.id, quizId: 'quiz-1', count: 1 },
        otherInstructor,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('creates one PENDING draft per generated question on the happy path', async () => {
    prisma.topic.findUnique.mockResolvedValue(topic as any);
    prisma.lesson.findMany.mockResolvedValue([]);
    aiProvider.generateQuizQuestions.mockResolvedValue([
      {
        type: QuestionType.MULTIPLE_CHOICE,
        prompt: 'What normal form eliminates transitive dependencies?',
        options: [
          { text: '2NF', isCorrect: false },
          { text: '3NF', isCorrect: true },
        ],
        explanation: 'Third normal form removes transitive dependencies.',
      },
      {
        type: QuestionType.SHORT_ANSWER,
        prompt: 'Define a functional dependency.',
        options: [],
        correctAnswerText: 'when one attribute determines another',
        explanation: 'A core relational algebra concept.',
      },
    ]);
    prisma.aiGeneratedQuestionDraft.create.mockImplementation(((args: any) =>
      Promise.resolve({ id: `draft-${args.data.prompt.length}`, ...args.data })) as any);

    const drafts = await service.generateDraftQuestions(
      instructor.userId,
      { topicId: topic.id, count: 2 },
      instructor,
    );

    expect(drafts).toHaveLength(2);
    expect(prisma.aiGeneratedQuestionDraft.create).toHaveBeenCalledTimes(2);
    for (const call of prisma.aiGeneratedQuestionDraft.create.mock.calls) {
      expect((call[0] as any).data.status).toBe(DraftStatus.PENDING);
      expect((call[0] as any).data.requestedById).toBe(instructor.userId);
    }
  });
});
