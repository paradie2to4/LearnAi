/**
 * Domain event contracts published/consumed on the `learnai.events` RabbitMQ topic exchange.
 * Routing keys map 1:1 to event names. Kept here so producer and consumer modules
 * (which may live in different files/packages) agree on a single shape.
 */

export const EVENT_EXCHANGE = 'learnai.events';

export const RoutingKeys = {
  QUIZ_COMPLETED: 'quiz.completed',
  LESSON_COMPLETED: 'lesson.completed',
  COURSE_COMPLETED: 'course.completed',
  ASSESSMENT_SUBMITTED: 'assessment.submitted',
  WEAK_TOPIC_DETECTED: 'weaktopic.detected',
  RECOMMENDATION_GENERATED: 'recommendation.generated',
} as const;

export interface TopicBreakdownEntry {
  topicId: string;
  correct: number;
  total: number;
}

export interface QuizCompletedEvent {
  userId: string;
  quizId: string;
  attemptId: string;
  courseId: string | null;
  isFinalAssessment: boolean;
  topicBreakdown: TopicBreakdownEntry[];
  score: number;
  maxScore: number;
  passed: boolean;
  occurredAt: string;
}

export interface AssessmentSubmittedEvent extends QuizCompletedEvent {}

export interface LessonCompletedEvent {
  userId: string;
  courseId: string;
  lessonId: string;
  occurredAt: string;
}

export interface CourseCompletedEvent {
  userId: string;
  courseId: string;
  occurredAt: string;
}

export interface WeakTopicDetectedEvent {
  userId: string;
  topicId: string;
  severity: number;
  masteryScore: number;
  occurredAt: string;
}

export interface RecommendationGeneratedEvent {
  userId: string;
  recommendationIds: string[];
  occurredAt: string;
}
