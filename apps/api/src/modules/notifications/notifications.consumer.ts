import { Injectable } from '@nestjs/common';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import {
  CourseCompletedEvent,
  EVENT_EXCHANGE,
  QuizCompletedEvent,
  RecommendationGeneratedEvent,
  RoutingKeys,
  WeakTopicDetectedEvent,
} from '@learnai/shared';
import { NotificationsService } from './notifications.service';

/**
 * Thin @RabbitSubscribe wrappers. Each handler immediately delegates to a
 * plain NotificationsService method so tests can call the service directly
 * without a live broker.
 */
@Injectable()
export class NotificationsConsumer {
  constructor(private readonly notificationsService: NotificationsService) {}

  @RabbitSubscribe({
    exchange: EVENT_EXCHANGE,
    routingKey: RoutingKeys.QUIZ_COMPLETED,
    queue: 'notifications.quiz-completed',
    queueOptions: { durable: true },
  })
  async handleQuizCompleted(payload: QuizCompletedEvent): Promise<void> {
    await this.notificationsService.notifyQuizCompleted(payload);
  }

  @RabbitSubscribe({
    exchange: EVENT_EXCHANGE,
    routingKey: RoutingKeys.WEAK_TOPIC_DETECTED,
    queue: 'notifications.weak-topic',
    queueOptions: { durable: true },
  })
  async handleWeakTopicDetected(payload: WeakTopicDetectedEvent): Promise<void> {
    await this.notificationsService.notifyWeakTopicDetected(payload);
  }

  @RabbitSubscribe({
    exchange: EVENT_EXCHANGE,
    routingKey: RoutingKeys.RECOMMENDATION_GENERATED,
    queue: 'notifications.recommendation-ready',
    queueOptions: { durable: true },
  })
  async handleRecommendationGenerated(payload: RecommendationGeneratedEvent): Promise<void> {
    await this.notificationsService.notifyRecommendationGenerated(payload);
  }

  @RabbitSubscribe({
    exchange: EVENT_EXCHANGE,
    routingKey: RoutingKeys.COURSE_COMPLETED,
    queue: 'notifications.course-completed',
    queueOptions: { durable: true },
  })
  async handleCourseCompleted(payload: CourseCompletedEvent): Promise<void> {
    await this.notificationsService.notifyCourseCompleted(payload);
  }
}
