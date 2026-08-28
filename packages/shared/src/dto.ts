import {
  ActivityType,
  AttemptStatus,
  DraftStatus,
  EnrollmentStatus,
  NotificationType,
  QuestionType,
  RecommendationStatus,
  RecommendationType,
  Role,
} from './enums';

export interface UserDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  createdAt: string;
}

export interface AuthTokensDto {
  accessToken: string;
  refreshToken: string;
  user: UserDto;
}

export interface SubjectDto {
  id: string;
  name: string;
  description: string | null;
}

export interface TopicDto {
  id: string;
  name: string;
  subjectId: string;
}

export interface LessonSummaryDto {
  id: string;
  title: string;
  order: number;
  estimatedMinutes: number | null;
  topicId: string | null;
  completed?: boolean;
}

export interface LessonDto extends LessonSummaryDto {
  content: string;
  moduleId: string;
}

export interface ModuleDto {
  id: string;
  title: string;
  order: number;
  lessons: LessonSummaryDto[];
}

export interface CourseSummaryDto {
  id: string;
  title: string;
  description: string;
  subject: SubjectDto;
  instructor: Pick<UserDto, 'id' | 'firstName' | 'lastName'>;
  isPublished: boolean;
  enrollmentCount?: number;
}

export interface CourseDetailDto extends CourseSummaryDto {
  modules: ModuleDto[];
}

export interface EnrollmentDto {
  id: string;
  courseId: string;
  status: EnrollmentStatus;
  enrolledAt: string;
  completedAt: string | null;
  course: CourseSummaryDto;
}

export interface QuestionOptionDto {
  id: string;
  text: string;
  order: number;
  isCorrect?: boolean; // omitted for student-facing quiz view
}

export interface QuestionDto {
  id: string;
  type: QuestionType;
  prompt: string;
  points: number;
  order: number;
  topicId: string;
  options: QuestionOptionDto[];
  explanation?: string | null; // only present after grading / to instructors
}

export interface QuizDto {
  id: string;
  title: string;
  courseId: string | null;
  lessonId: string | null;
  passingScore: number;
  timeLimitMinutes: number | null;
  isPublished: boolean;
  questions: QuestionDto[];
}

export interface AnswerInput {
  questionId: string;
  selectedOptionIds?: string[];
  answerText?: string;
}

export interface AnswerResultDto {
  questionId: string;
  isCorrect: boolean;
  pointsAwarded: number;
  correctOptionIds?: string[];
  correctAnswerText?: string;
  explanation?: string | null;
}

export interface QuizAttemptDto {
  id: string;
  quizId: string;
  status: AttemptStatus;
  startedAt: string;
  submittedAt: string | null;
  score: number | null;
  maxScore: number | null;
  passed: boolean | null;
  answers?: AnswerResultDto[];
}

export interface TopicMasteryDto {
  topicId: string;
  topicName: string;
  masteryScore: number;
  attemptsCount: number;
  lastActivityAt: string;
}

export interface CourseProgressDto {
  courseId: string;
  completionPercent: number;
  lessonsCompleted: number;
  totalLessons: number;
  currentStreakDays: number;
  longestStreakDays: number;
}

export interface ProgressSummaryDto {
  topics: TopicMasteryDto[];
  courses: CourseProgressDto[];
  currentStreakDays: number;
  longestStreakDays: number;
}

export interface WeakTopicDto {
  id: string;
  topicId: string;
  topicName: string;
  severity: number;
  masteryScore: number;
  detectedAt: string;
}

export interface RecommendationDto {
  id: string;
  type: RecommendationType;
  status: RecommendationStatus;
  narrative: string;
  studyOrder: number | null;
  topicId: string | null;
  courseId: string | null;
  lessonId: string | null;
  generatedAt: string;
}

export interface NotificationDto {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
}

export interface AiDraftQuestionDto {
  id: string;
  quizId: string | null;
  topicId: string;
  type: QuestionType;
  prompt: string;
  options: QuestionOptionDto[];
  explanation: string | null;
  status: DraftStatus;
  createdAt: string;
}

export interface CourseAnalyticsDto {
  courseId: string;
  enrollmentCount: number;
  completionRate: number;
  averageScore: number;
  questionSuccessRates: { questionId: string; prompt: string; successRate: number }[];
  weakestTopics: { topicId: string; topicName: string; averageMastery: number }[];
}

export interface ActivityFeedItemDto {
  type: ActivityType;
  courseId: string | null;
  lessonId: string | null;
  occurredAt: string;
}
