import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { EVENT_EXCHANGE, RoutingKeys } from '@learnai/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { WeakTopicDetectionService, MIN_ATTEMPTS } from './weak-topic-detection.service';

describe('WeakTopicDetectionService', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let amqpConnection: DeepMockProxy<AmqpConnection>;
  let service: WeakTopicDetectionService;

  function progress(overrides: Partial<{ masteryScore: number; attemptsCount: number }> = {}) {
    return {
      id: 'sp1',
      userId: 'u1',
      topicId: 't1',
      masteryScore: 40,
      attemptsCount: MIN_ATTEMPTS,
      correctCount: 1,
      lastActivityAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    } as any;
  }

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    amqpConnection = mockDeep<AmqpConnection>();
    service = new WeakTopicDetectionService(prisma, amqpConnection);
  });

  it('does not evaluate a topic below MIN_ATTEMPTS', async () => {
    prisma.studentProgress.findUnique.mockResolvedValue(progress({ attemptsCount: MIN_ATTEMPTS - 1 }));

    await service.detectForUser('u1', ['t1']);

    expect(prisma.weakTopic.upsert).not.toHaveBeenCalled();
    expect(amqpConnection.publish).not.toHaveBeenCalled();
  });

  it('treats mastery of 49 as a primary weakness: upserts and publishes', async () => {
    prisma.studentProgress.findUnique.mockResolvedValue(progress({ masteryScore: 49 }));
    prisma.weakTopic.findUnique.mockResolvedValue(null);
    prisma.weakTopic.upsert.mockResolvedValue({} as any);

    await service.detectForUser('u1', ['t1']);

    expect(prisma.weakTopic.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ severity: 51 }) }),
    );
    expect(amqpConnection.publish).toHaveBeenCalledWith(
      EVENT_EXCHANGE,
      RoutingKeys.WEAK_TOPIC_DETECTED,
      expect.objectContaining({ userId: 'u1', topicId: 't1', masteryScore: 49 }),
    );
  });

  it('treats mastery of exactly 50 as watch-zone: upserts but does not publish', async () => {
    prisma.studentProgress.findUnique.mockResolvedValue(progress({ masteryScore: 50 }));
    prisma.weakTopic.findUnique.mockResolvedValue(null);
    prisma.weakTopic.upsert.mockResolvedValue({} as any);

    await service.detectForUser('u1', ['t1']);

    expect(prisma.weakTopic.upsert).toHaveBeenCalled();
    expect(amqpConnection.publish).not.toHaveBeenCalled();
  });

  it('resolves an unresolved WeakTopic once mastery reaches exactly 70', async () => {
    prisma.studentProgress.findUnique.mockResolvedValue(progress({ masteryScore: 70 }));
    prisma.weakTopic.findUnique.mockResolvedValue({
      id: 'wt1',
      userId: 'u1',
      topicId: 't1',
      severity: 60,
      detectedAt: new Date(),
      resolvedAt: null,
      basedOnAttempts: 3,
    } as any);

    await service.detectForUser('u1', ['t1']);

    expect(prisma.weakTopic.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'wt1' },
        data: expect.objectContaining({ resolvedAt: expect.any(Date) }),
      }),
    );
    expect(prisma.weakTopic.upsert).not.toHaveBeenCalled();
    expect(amqpConnection.publish).not.toHaveBeenCalled();
  });

  it('does not publish again on every attempt when severity has not increased meaningfully', async () => {
    prisma.studentProgress.findUnique.mockResolvedValue(progress({ masteryScore: 40 })); // severity 60
    prisma.weakTopic.findUnique.mockResolvedValue({
      id: 'wt1',
      userId: 'u1',
      topicId: 't1',
      severity: 58, // previous severity; new is 60, delta=2 < threshold(5)
      detectedAt: new Date(),
      resolvedAt: null,
      basedOnAttempts: 3,
    } as any);
    prisma.weakTopic.upsert.mockResolvedValue({} as any);

    await service.detectForUser('u1', ['t1']);

    expect(prisma.weakTopic.upsert).toHaveBeenCalled();
    expect(amqpConnection.publish).not.toHaveBeenCalled();
  });

  it('publishes again when severity increased by more than the threshold since last detection', async () => {
    prisma.studentProgress.findUnique.mockResolvedValue(progress({ masteryScore: 30 })); // severity 70
    prisma.weakTopic.findUnique.mockResolvedValue({
      id: 'wt1',
      userId: 'u1',
      topicId: 't1',
      severity: 60, // delta = 10 > threshold(5)
      detectedAt: new Date(),
      resolvedAt: null,
      basedOnAttempts: 3,
    } as any);
    prisma.weakTopic.upsert.mockResolvedValue({} as any);

    await service.detectForUser('u1', ['t1']);

    expect(amqpConnection.publish).toHaveBeenCalledTimes(1);
  });

  it('publishes for a fresh detection after a prior resolution (new occurrence)', async () => {
    prisma.studentProgress.findUnique.mockResolvedValue(progress({ masteryScore: 40 }));
    prisma.weakTopic.findUnique.mockResolvedValue({
      id: 'wt1',
      userId: 'u1',
      topicId: 't1',
      severity: 20,
      detectedAt: new Date(),
      resolvedAt: new Date(), // was previously resolved
      basedOnAttempts: 3,
    } as any);
    prisma.weakTopic.upsert.mockResolvedValue({} as any);

    await service.detectForUser('u1', ['t1']);

    expect(amqpConnection.publish).toHaveBeenCalledTimes(1);
  });
});
