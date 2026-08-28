import { Injectable } from '@nestjs/common';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { EVENT_EXCHANGE, LessonCompletedEvent, QuizCompletedEvent, RoutingKeys } from '@learnai/shared';
import { ProgressService } from './progress.service';

/**
 * Thin @RabbitSubscribe wrappers. Each handler immediately delegates to a
 * plain ProgressService method so tests can call the service directly
 * without a live broker.
 */
@Injectable()
export class ProgressConsumer {
  constructor(private readonly progressService: ProgressService) {}

  @RabbitSubscribe({
    exchange: EVENT_EXCHANGE,
    routingKey: RoutingKeys.QUIZ_COMPLETED,
    queue: 'progress.quiz-completed',
    queueOptions: { durable: true },
  })
  async handleQuizCompleted(payload: QuizCompletedEvent): Promise<void> {
    return this.progressService.recalculateForQuizCompleted(payload);
  }

  @RabbitSubscribe({
    exchange: EVENT_EXCHANGE,
    routingKey: RoutingKeys.LESSON_COMPLETED,
    queue: 'progress.lesson-completed',
    queueOptions: { durable: true },
  })
  async handleLessonCompleted(payload: LessonCompletedEvent): Promise<void> {
    return this.progressService.recalculateForLessonCompleted(payload);
  }
}
