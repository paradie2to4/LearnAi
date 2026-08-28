import { QuestionType } from '@learnai/shared';

/**
 * Provider-agnostic contract for every AI-backed capability in the platform.
 * The concrete implementation (AnthropicProvider) is bound to this interface
 * via the AI_PROVIDER DI token (see ai.constants.ts) so it can be swapped or
 * mocked in tests without touching any consumer (recommendations, quizzes, etc).
 */

export interface GeneratedOption {
  text: string;
  isCorrect: boolean;
}

export interface GeneratedQuestion {
  type: QuestionType;
  prompt: string;
  options: GeneratedOption[]; // empty for SHORT_ANSWER
  correctAnswerText?: string; // only for SHORT_ANSWER
  acceptableAnswers?: string[]; // only for SHORT_ANSWER
  explanation: string;
}

export interface GenerateQuestionsInput {
  subject: string;
  topicName: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  count: number;
  questionTypes?: QuestionType[];
  /** Optional lesson content excerpts so generated questions match what was taught. */
  groundingContent?: string[];
}

export interface ExplainIncorrectAnswerInput {
  questionPrompt: string;
  options: { text: string; isCorrect: boolean }[];
  selectedAnswerText: string;
  correctAnswerText: string;
  existingExplanation?: string | null;
}

export interface RecommendationCandidate {
  topicId: string;
  topicName: string;
  masteryScore: number;
  severity: number;
  candidateLessons: { lessonId: string; title: string }[];
  candidateQuizzes: { quizId: string; title: string }[];
}

export interface RecommendationNarrativeInput {
  studentFirstName: string;
  candidates: RecommendationCandidate[]; // pre-ranked by severity desc; AI explains/orders, does not re-rank
}

export interface StudyOrderItem {
  topicId: string;
  lessonId?: string;
  quizId?: string;
  rationale: string;
}

export interface RecommendationNarrativeOutput {
  narrative: string;
  studyOrder: StudyOrderItem[];
}

export interface StudyAssistantMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface StudyAssistantInput {
  studentFirstName: string;
  /** Grounding context: the student's own progress/weak topics + relevant lesson excerpts. */
  contextSummary: string;
  history: StudyAssistantMessage[];
  question: string;
}

export interface AiProvider {
  generateQuizQuestions(input: GenerateQuestionsInput): Promise<GeneratedQuestion[]>;
  explainIncorrectAnswer(input: ExplainIncorrectAnswerInput): Promise<string>;
  generateRecommendationNarrative(
    input: RecommendationNarrativeInput,
  ): Promise<RecommendationNarrativeOutput>;
  answerStudyAssistantQuestion(input: StudyAssistantInput): Promise<string>;
}
