import { QuestionType } from '@learnai/shared';
import { ScoringQuestion, ScoringService, ScoringSubmission } from './scoring.service';

describe('ScoringService', () => {
  let service: ScoringService;

  beforeEach(() => {
    service = new ScoringService();
  });

  const mcQuestion = (points = 10): ScoringQuestion => ({
    id: 'q-mc',
    type: QuestionType.MULTIPLE_CHOICE,
    points,
    topicId: 'topic-1',
    options: [
      { id: 'opt-a', isCorrect: false },
      { id: 'opt-b', isCorrect: true },
      { id: 'opt-c', isCorrect: false },
    ],
  });

  const tfQuestion = (points = 5): ScoringQuestion => ({
    id: 'q-tf',
    type: QuestionType.TRUE_FALSE,
    points,
    topicId: 'topic-1',
    options: [
      { id: 'true', isCorrect: true },
      { id: 'false', isCorrect: false },
    ],
  });

  const maQuestion = (points = 12): ScoringQuestion => ({
    id: 'q-ma',
    type: QuestionType.MULTIPLE_ANSWER,
    points,
    topicId: 'topic-2',
    options: [
      { id: 'opt-1', isCorrect: true },
      { id: 'opt-2', isCorrect: true },
      { id: 'opt-3', isCorrect: true },
      { id: 'opt-4', isCorrect: false },
    ],
  });

  const saQuestion = (points = 4): ScoringQuestion => ({
    id: 'q-sa',
    type: QuestionType.SHORT_ANSWER,
    points,
    topicId: 'topic-3',
    options: [],
    correctAnswerText: 'Isaac Newton',
    acceptableAnswers: ['Sir Isaac Newton'],
  });

  describe('MULTIPLE_CHOICE', () => {
    it('awards full points for the correct option', () => {
      const result = service.scoreAttempt(
        [mcQuestion()],
        [{ questionId: 'q-mc', selectedOptionIds: ['opt-b'] }],
        70,
        true,
      );
      expect(result.results[0]).toEqual({ questionId: 'q-mc', isCorrect: true, pointsAwarded: 10 });
    });

    it('awards zero for an incorrect option', () => {
      const result = service.scoreAttempt(
        [mcQuestion()],
        [{ questionId: 'q-mc', selectedOptionIds: ['opt-a'] }],
        70,
        true,
      );
      expect(result.results[0]).toEqual({ questionId: 'q-mc', isCorrect: false, pointsAwarded: 0 });
    });
  });

  describe('TRUE_FALSE', () => {
    it('awards full points for the correct option', () => {
      const result = service.scoreAttempt(
        [tfQuestion()],
        [{ questionId: 'q-tf', selectedOptionIds: ['true'] }],
        70,
        true,
      );
      expect(result.results[0]).toEqual({ questionId: 'q-tf', isCorrect: true, pointsAwarded: 5 });
    });

    it('awards zero for the incorrect option', () => {
      const result = service.scoreAttempt(
        [tfQuestion()],
        [{ questionId: 'q-tf', selectedOptionIds: ['false'] }],
        70,
        true,
      );
      expect(result.results[0]).toEqual({ questionId: 'q-tf', isCorrect: false, pointsAwarded: 0 });
    });
  });

  describe('MULTIPLE_ANSWER with partial credit enabled', () => {
    const submit = (selectedOptionIds: string[]): ScoringSubmission => ({
      questionId: 'q-ma',
      selectedOptionIds,
    });

    it('exact match: all correct selected, none incorrect -> full points and isCorrect true', () => {
      const result = service.scoreAttempt([maQuestion()], [submit(['opt-1', 'opt-2', 'opt-3'])], 70, true);
      expect(result.results[0]).toEqual({ questionId: 'q-ma', isCorrect: true, pointsAwarded: 12 });
    });

    it('all wrong selected -> floors at zero, not negative', () => {
      const result = service.scoreAttempt([maQuestion()], [submit(['opt-4'])], 70, true);
      expect(result.results[0].isCorrect).toBe(false);
      expect(result.results[0].pointsAwarded).toBe(0);
    });

    it('over-selection (all options selected) gives a non-negative floor, not full credit', () => {
      // correctSelected=3, incorrectSelected=1, totalCorrect=3 -> (3-1)/3 = 2/3
      const result = service.scoreAttempt(
        [maQuestion()],
        [submit(['opt-1', 'opt-2', 'opt-3', 'opt-4'])],
        70,
        true,
      );
      expect(result.results[0].isCorrect).toBe(false); // not an exact set match
      expect(result.results[0].pointsAwarded).toBeCloseTo((2 / 3) * 12);
      expect(result.results[0].pointsAwarded).toBeGreaterThanOrEqual(0);
    });

    it('under-selection gives partial credit proportional to correctSelected/totalCorrect', () => {
      // correctSelected=1, incorrectSelected=0, totalCorrect=3 -> 1/3
      const result = service.scoreAttempt([maQuestion()], [submit(['opt-1'])], 70, true);
      expect(result.results[0].isCorrect).toBe(false);
      expect(result.results[0].pointsAwarded).toBeCloseTo((1 / 3) * 12);
    });

    it('a bad mix (2 correct + 2 incorrect where only 1 is wrong is possible) still floors at zero', () => {
      // correctSelected=1, incorrectSelected=1 (only one wrong option exists: opt-4), totalCorrect=3 -> (1-1)/3=0
      const result = service.scoreAttempt([maQuestion()], [submit(['opt-1', 'opt-4'])], 70, true);
      expect(result.results[0].pointsAwarded).toBe(0);
    });
  });

  describe('MULTIPLE_ANSWER with partial credit disabled (all-or-nothing)', () => {
    const submit = (selectedOptionIds: string[]): ScoringSubmission => ({
      questionId: 'q-ma',
      selectedOptionIds,
    });

    it('awards full points only for an exact set match', () => {
      const result = service.scoreAttempt([maQuestion()], [submit(['opt-1', 'opt-2', 'opt-3'])], 70, false);
      expect(result.results[0]).toEqual({ questionId: 'q-ma', isCorrect: true, pointsAwarded: 12 });
    });

    it('awards zero for a partial (under) selection', () => {
      const result = service.scoreAttempt([maQuestion()], [submit(['opt-1', 'opt-2'])], 70, false);
      expect(result.results[0]).toEqual({ questionId: 'q-ma', isCorrect: false, pointsAwarded: 0 });
    });

    it('awards zero for an over-selection', () => {
      const result = service.scoreAttempt(
        [maQuestion()],
        [submit(['opt-1', 'opt-2', 'opt-3', 'opt-4'])],
        70,
        false,
      );
      expect(result.results[0]).toEqual({ questionId: 'q-ma', isCorrect: false, pointsAwarded: 0 });
    });
  });

  describe('SHORT_ANSWER', () => {
    it('matches an exact answer', () => {
      const result = service.scoreAttempt(
        [saQuestion()],
        [{ questionId: 'q-sa', answerText: 'Isaac Newton' }],
        70,
        true,
      );
      expect(result.results[0]).toEqual({ questionId: 'q-sa', isCorrect: true, pointsAwarded: 4 });
    });

    it('is case-insensitive', () => {
      const result = service.scoreAttempt(
        [saQuestion()],
        [{ questionId: 'q-sa', answerText: 'isaac newton' }],
        70,
        true,
      );
      expect(result.results[0].isCorrect).toBe(true);
    });

    it('is whitespace-insensitive (collapses repeated / trims)', () => {
      const result = service.scoreAttempt(
        [saQuestion()],
        [{ questionId: 'q-sa', answerText: '  isaac    newton  ' }],
        70,
        true,
      );
      expect(result.results[0].isCorrect).toBe(true);
    });

    it('is punctuation-insensitive', () => {
      const result = service.scoreAttempt(
        [saQuestion()],
        [{ questionId: 'q-sa', answerText: 'isaac, newton!' }],
        70,
        true,
      );
      expect(result.results[0].isCorrect).toBe(true);
    });

    it('matches against acceptableAnswers too', () => {
      const result = service.scoreAttempt(
        [saQuestion()],
        [{ questionId: 'q-sa', answerText: 'Sir Isaac Newton' }],
        70,
        true,
      );
      expect(result.results[0].isCorrect).toBe(true);
    });

    it('scores zero for a mismatched answer', () => {
      const result = service.scoreAttempt(
        [saQuestion()],
        [{ questionId: 'q-sa', answerText: 'Albert Einstein' }],
        70,
        true,
      );
      expect(result.results[0]).toEqual({ questionId: 'q-sa', isCorrect: false, pointsAwarded: 0 });
    });
  });

  describe('unanswered questions', () => {
    it('scores zero when there is no submission row at all', () => {
      const result = service.scoreAttempt([mcQuestion()], [], 70, true);
      expect(result.results[0]).toEqual({ questionId: 'q-mc', isCorrect: false, pointsAwarded: 0 });
    });

    it('scores zero for an empty selectedOptionIds array', () => {
      const result = service.scoreAttempt(
        [maQuestion()],
        [{ questionId: 'q-ma', selectedOptionIds: [] }],
        70,
        true,
      );
      expect(result.results[0]).toEqual({ questionId: 'q-ma', isCorrect: false, pointsAwarded: 0 });
    });

    it('scores zero for an empty/blank answerText', () => {
      const result = service.scoreAttempt(
        [saQuestion()],
        [{ questionId: 'q-sa', answerText: '   ' }],
        70,
        true,
      );
      expect(result.results[0]).toEqual({ questionId: 'q-sa', isCorrect: false, pointsAwarded: 0 });
    });
  });

  describe('passed threshold', () => {
    // 7/10 points = 70% — use passingScore=70 as the boundary.
    it('passes when the percentage is exactly at passingScore', () => {
      const result = service.scoreAttempt(
        [mcQuestion(7), tfQuestion(3)],
        [
          { questionId: 'q-mc', selectedOptionIds: ['opt-b'] },
          { questionId: 'q-tf', selectedOptionIds: ['false'] },
        ],
        70,
        true,
      );
      expect(result.score).toBe(7);
      expect(result.maxScore).toBe(10);
      expect(result.passed).toBe(true);
    });

    it('fails when one point under the passing threshold', () => {
      const result = service.scoreAttempt(
        [mcQuestion(6), tfQuestion(4)],
        [
          { questionId: 'q-mc', selectedOptionIds: ['opt-b'] },
          { questionId: 'q-tf', selectedOptionIds: ['false'] },
        ],
        70,
        true,
      );
      expect(result.score).toBe(6);
      expect(result.maxScore).toBe(10);
      expect(result.passed).toBe(false);
    });
  });

  describe('divide-by-zero guard', () => {
    it('never passes a quiz whose questions sum to zero points', () => {
      const zeroPointQuestion = mcQuestion(0);
      const result = service.scoreAttempt(
        [zeroPointQuestion],
        [{ questionId: 'q-mc', selectedOptionIds: ['opt-b'] }],
        0,
        true,
      );
      expect(result.maxScore).toBe(0);
      expect(result.score).toBe(0);
      expect(result.passed).toBe(false);
    });
  });
});
