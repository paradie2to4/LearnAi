import { Injectable } from '@nestjs/common';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import {
  AssessmentSubmittedEvent,
  EVENT_EXCHANGE,
  QuizCompletedEvent,
  RoutingKeys,
  WeakTopicDetectedEvent,
} from '@learnai/shared';
import { RecommendationService } from './recommendation.service';
import { WeakTopicDetectionService } from './weak-topic-detection.service';

/**
 * Thin @RabbitSubscribe wrappers. Each handler immediately delegates to a
 * plain service method so tests can call the service directly without a
 * live broker.
 */
@Injectable()
export class RecommendationsConsumer {
  constructor(
    private readonly weakTopicDetectionService: WeakTopicDetectionService,
    private readonly recommendationService: RecommendationService,
  ) {}

  // Same queue, bound to both quiz.completed and assessment.submitted since
  // both payload shapes carry a topicBreakdown that drives weak-topic detection.
  @RabbitSubscribe({
    exchange: EVENT_EXCHANGE,
    routingKey: RoutingKeys.QUIZ_COMPLETED,
    queue: 'recommendations.weak-topic-detection',
    queueOptions: { durable: true },
  })
  async handleQuizCompleted(payload: QuizCompletedEvent): Promise<void> {
    return this.detectFromQuizEvent(payload);
  }

  @RabbitSubscribe({
    exchange: EVENT_EXCHANGE,
    routingKey: RoutingKeys.ASSESSMENT_SUBMITTED,
    queue: 'recommendations.weak-topic-detection',
    queueOptions: { durable: true },
  })
  async handleAssessmentSubmitted(payload: AssessmentSubmittedEvent): Promise<void> {
    return this.detectFromQuizEvent(payload);
  }

  private detectFromQuizEvent(payload: QuizCompletedEvent): Promise<void> {
    const topicIds = payload.topicBreakdown.map((entry) => entry.topicId);
    return this.weakTopicDetectionService.detectForUser(payload.userId, topicIds);
  }

  @RabbitSubscribe({
    exchange: EVENT_EXCHANGE,
    routingKey: RoutingKeys.WEAK_TOPIC_DETECTED,
    queue: 'recommendations.generation',
    queueOptions: { durable: true },
  })
  async handleWeakTopicDetected(payload: WeakTopicDetectedEvent): Promise<void> {
    return this.recommendationService.generateForWeakTopic(payload);
  }
}
