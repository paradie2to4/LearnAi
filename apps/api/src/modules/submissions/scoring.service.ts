import { Injectable } from '@nestjs/common';
import { QuestionType } from '@learnai/shared';

export interface ScoringOption {
  id: string;
  isCorrect: boolean;
}

/** The minimal question shape the scoring engine needs — no Prisma types leak in here. */
export interface ScoringQuestion {
  id: string;
  type: QuestionType | string;
  points: number;
  topicId: string;
  options: ScoringOption[];
  correctAnswerText?: string | null;
  acceptableAnswers?: string[];
}

export interface ScoringSubmission {
  questionId: string;
  selectedOptionIds?: string[] | null;
  answerText?: string | null;
}

export interface ScoredQuestionResult {
  questionId: string;
  isCorrect: boolean;
  pointsAwarded: number;
}

export interface ScoreAttemptResult {
  results: ScoredQuestionResult[];
  score: number;
  maxScore: number;
  passed: boolean;
}

/**
 * Pure, side-effect-free scoring engine: no Prisma, no IO, no clock reads.
 * Given fully-loaded question/option data and the raw per-question
 * submissions for one attempt, returns the graded result. Because it's
 * pure it can (and should) be unit tested exhaustively with zero mocking.
 *
 * `partialCreditMultiAnswer` is threaded in explicitly as its own parameter
 * (rather than folded into `ScoringQuestion`) since it's a quiz-level
 * setting, not a per-question one, and callers already have the Quiz row
 * loaded at the point they invoke this.
 */
@Injectable()
export class ScoringService {
  scoreAttempt(
    questions: ScoringQuestion[],
    submissions: ScoringSubmission[],
    passingScore: number,
    partialCreditMultiAnswer: boolean,
  ): ScoreAttemptResult {
    const submissionByQuestionId = new Map(submissions.map((s) => [s.questionId, s]));

    const results = questions.map((question) =>
      this.scoreQuestion(question, submissionByQuestionId.get(question.id), partialCreditMultiAnswer),
    );

    const maxScore = questions.reduce((sum, q) => sum + q.points, 0);
    const score = results.reduce((sum, r) => sum + r.pointsAwarded, 0);
    const passed = maxScore > 0 ? (score / maxScore) * 100 >= passingScore : false;

    return { results, score, maxScore, passed };
  }

  private scoreQuestion(
    question: ScoringQuestion,
    submission: ScoringSubmission | undefined,
    partialCreditMultiAnswer: boolean,
  ): ScoredQuestionResult {
    switch (question.type) {
      case QuestionType.MULTIPLE_CHOICE:
      case QuestionType.TRUE_FALSE:
        return this.scoreSingleSelect(question, submission);
      case QuestionType.MULTIPLE_ANSWER:
        return this.scoreMultipleAnswer(question, submission, partialCreditMultiAnswer);
      case QuestionType.SHORT_ANSWER:
        return this.scoreShortAnswer(question, submission);
      default:
        return { questionId: question.id, isCorrect: false, pointsAwarded: 0 };
    }
  }

  /** MULTIPLE_CHOICE & TRUE_FALSE: exactly one selected id must equal the single correct option. No partial credit. */
  private scoreSingleSelect(question: ScoringQuestion, submission?: ScoringSubmission): ScoredQuestionResult {
    const selected = submission?.selectedOptionIds ?? [];
    const correctOption = question.options.find((o) => o.isCorrect);
    const isCorrect = selected.length === 1 && !!correctOption && selected[0] === correctOption.id;

    return {
      questionId: question.id,
      isCorrect,
      pointsAwarded: isCorrect ? question.points : 0,
    };
  }

  private scoreMultipleAnswer(
    question: ScoringQuestion,
    submission: ScoringSubmission | undefined,
    partialCreditMultiAnswer: boolean,
  ): ScoredQuestionResult {
    const correctIds = new Set(question.options.filter((o) => o.isCorrect).map((o) => o.id));
    const selectedIds = new Set(submission?.selectedOptionIds ?? []);

    const isExactMatch =
      correctIds.size === selectedIds.size && [...correctIds].every((id) => selectedIds.has(id));

    if (!partialCreditMultiAnswer) {
      // All-or-nothing: full points only for an exact set match.
      return {
        questionId: question.id,
        isCorrect: isExactMatch,
        pointsAwarded: isExactMatch ? question.points : 0,
      };
    }

    const totalCorrect = correctIds.size;
    if (totalCorrect === 0) {
      // Malformed question data (no correct options) — nothing to award.
      return { questionId: question.id, isCorrect: isExactMatch, pointsAwarded: 0 };
    }

    let correctSelected = 0;
    let incorrectSelected = 0;
    for (const id of selectedIds) {
      if (correctIds.has(id)) {
        correctSelected += 1;
      } else {
        incorrectSelected += 1;
      }
    }

    const rawFraction = Math.max(0, (correctSelected - incorrectSelected) / totalCorrect);

    return {
      questionId: question.id,
      isCorrect: isExactMatch,
      pointsAwarded: rawFraction * question.points,
    };
  }

  private scoreShortAnswer(question: ScoringQuestion, submission?: ScoringSubmission): ScoredQuestionResult {
    const answerText = submission?.answerText;
    if (!answerText || answerText.trim().length === 0) {
      return { questionId: question.id, isCorrect: false, pointsAwarded: 0 };
    }

    const acceptable = [question.correctAnswerText, ...(question.acceptableAnswers ?? [])].filter(
      (v): v is string => !!v,
    );
    const normalizedSubmission = this.normalize(answerText);
    const isCorrect = acceptable.some((candidate) => this.normalize(candidate) === normalizedSubmission);

    return {
      questionId: question.id,
      isCorrect,
      pointsAwarded: isCorrect ? question.points : 0,
    };
  }

  /**
   * trim -> lowercase -> collapse whitespace -> strip punctuation, per spec.
   * A trailing collapse+trim pass is added after punctuation-stripping to
   * clean up any double-space artifacts punctuation removal can introduce
   * (e.g. "hello , world" -> "hello  world"); this is a strict superset of
   * the specified behavior and does not change the outcome for any input
   * that doesn't have whitespace directly adjacent to punctuation.
   */
  private normalize(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
