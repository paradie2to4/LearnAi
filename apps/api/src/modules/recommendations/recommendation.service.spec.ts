import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { EVENT_EXCHANGE, RoutingKeys } from '@learnai/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AiProvider } from '../ai/ai-provider.interface';
import { RecommendationService } from './recommendation.service';

describe('RecommendationService', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let amqpConnection: DeepMockProxy<AmqpConnection>;
  let aiProvider: DeepMockProxy<AiProvider>;
  let service: RecommendationService;

  const weakTopicRow = {
    id: 'wt1',
    userId: 'u1',
    topicId: 't1',
    severity: 60,
    detectedAt: new Date(),
    resolvedAt: null,
    basedOnAttempts: 3,
  };

  const event = {
    userId: 'u1',
    topicId: 't1',
    severity: 60,
    masteryScore: 40,
    occurredAt: new Date().toISOString(),
  };

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    amqpConnection = mockDeep<AmqpConnection>();
    aiProvider = mockDeep<AiProvider>();
    service = new RecommendationService(prisma, amqpConnection, aiProvider);

    prisma.weakTopic.findUnique.mockResolvedValue(weakTopicRow as any);
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', firstName: 'Ada' } as any);
    prisma.topic.findUnique.mockResolvedValue({
      id: 't1',
      name: 'Derivatives',
      lessons: [{ id: 'l1', title: 'Intro to Derivatives' }],
    } as any);
    prisma.quiz.findMany.mockResolvedValue([]);
    prisma.recommendation.create.mockImplementation(
      (args: any) => Promise.resolve({ id: `rec-${args.data.studyOrder}`, ...args.data }) as any,
    );
  });

  it('skips regeneration when an ACTIVE recommendation for the same weak topic was generated within 24h', async () => {
    prisma.recommendation.findFirst.mockResolvedValue({ id: 'existing-rec' } as any);

    await service.generateForWeakTopic(event as any);

    expect(aiProvider.generateRecommendationNarrative).not.toHaveBeenCalled();
    expect(prisma.recommendation.create).not.toHaveBeenCalled();
    expect(amqpConnection.publish).not.toHaveBeenCalled();
  });

  it('falls back to a templated narrative when the AI provider throws', async () => {
    prisma.recommendation.findFirst.mockResolvedValue(null);
    aiProvider.generateRecommendationNarrative.mockRejectedValue(new Error('no api key'));

    await service.generateForWeakTopic(event as any);

    expect(prisma.recommendation.create).toHaveBeenCalledTimes(1);
    const createArgs = prisma.recommendation.create.mock.calls[0][0] as any;
    expect(createArgs.data.narrative).toContain('Derivatives');
    expect(createArgs.data.studyOrder).toBe(0);
    expect(createArgs.data.status).toBe('ACTIVE');
  });

  it('persists one Recommendation per studyOrder entry returned by the AI provider', async () => {
    prisma.recommendation.findFirst.mockResolvedValue(null);
    aiProvider.generateRecommendationNarrative.mockResolvedValue({
      narrative: 'overall narrative',
      studyOrder: [
        { topicId: 't1', lessonId: 'l1', rationale: 'Start with the lesson' },
        { topicId: 't1', quizId: 'q1', rationale: 'Then take the quiz' },
      ],
    });

    await service.generateForWeakTopic(event as any);

    expect(prisma.recommendation.create).toHaveBeenCalledTimes(2);
    expect(prisma.recommendation.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({ studyOrder: 0, narrative: 'Start with the lesson' }),
      }),
    );
    expect(prisma.recommendation.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({ studyOrder: 1, narrative: 'Then take the quiz' }),
      }),
    );
  });

  it('publishes RecommendationGenerated with the right userId and the created recommendation ids', async () => {
    prisma.recommendation.findFirst.mockResolvedValue(null);
    aiProvider.generateRecommendationNarrative.mockResolvedValue({
      narrative: 'overall narrative',
      studyOrder: [],
    });

    await service.generateForWeakTopic(event as any);

    expect(amqpConnection.publish).toHaveBeenCalledWith(
      EVENT_EXCHANGE,
      RoutingKeys.RECOMMENDATION_GENERATED,
      expect.objectContaining({ userId: 'u1', recommendationIds: ['rec-0'] }),
    );
  });
});
