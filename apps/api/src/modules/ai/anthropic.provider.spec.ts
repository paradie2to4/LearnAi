import { ConfigService } from '@nestjs/config';
import { QuestionType } from '@learnai/shared';
import { AiUnavailableException } from './ai-unavailable.exception';

const mockCreate = jest.fn();

jest.mock('@anthropic-ai/sdk', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      messages: { create: mockCreate },
    })),
  };
});

// Imported after the mock so the mocked module is what gets wired in.
import { AnthropicProvider } from './anthropic.provider';

function configServiceWith(values: Record<string, string>): ConfigService {
  return { get: jest.fn((key: string) => values[key]) } as unknown as ConfigService;
}

function textResponse(text: string) {
  return { content: [{ type: 'text', text }] };
}

describe('AnthropicProvider', () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  describe('when ANTHROPIC_API_KEY is not configured', () => {
    const provider = new AnthropicProvider(
      configServiceWith({ ANTHROPIC_API_KEY: '', AI_MODEL_ID: 'claude-opus-5' }),
    );

    it('rejects generateQuizQuestions with AiUnavailableException', async () => {
      await expect(
        provider.generateQuizQuestions({ subject: 'CS', topicName: 'SQL', difficulty: 'EASY', count: 1 }),
      ).rejects.toBeInstanceOf(AiUnavailableException);
    });

    it('rejects explainIncorrectAnswer with AiUnavailableException', async () => {
      await expect(
        provider.explainIncorrectAnswer({
          questionPrompt: 'q',
          options: [],
          selectedAnswerText: 'a',
          correctAnswerText: 'b',
        }),
      ).rejects.toBeInstanceOf(AiUnavailableException);
    });

    it('rejects generateRecommendationNarrative with AiUnavailableException', async () => {
      await expect(
        provider.generateRecommendationNarrative({ studentFirstName: 'Ada', candidates: [] }),
      ).rejects.toBeInstanceOf(AiUnavailableException);
    });

    it('rejects answerStudyAssistantQuestion with AiUnavailableException', async () => {
      await expect(
        provider.answerStudyAssistantQuestion({
          studentFirstName: 'Ada',
          contextSummary: '',
          history: [],
          question: 'hi',
        }),
      ).rejects.toBeInstanceOf(AiUnavailableException);
    });

    it('never calls the Anthropic client at all', () => {
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe('when ANTHROPIC_API_KEY is configured', () => {
    let provider: AnthropicProvider;

    beforeEach(() => {
      provider = new AnthropicProvider(
        configServiceWith({ ANTHROPIC_API_KEY: 'test-key', AI_MODEL_ID: 'claude-opus-5' }),
      );
    });

    it('sends the configured model id and parses a well-formed question response', async () => {
      const wellFormed = [
        {
          type: QuestionType.MULTIPLE_CHOICE,
          prompt: 'What is 2+2?',
          options: [
            { text: '3', isCorrect: false },
            { text: '4', isCorrect: true },
          ],
          explanation: 'Basic arithmetic.',
        },
      ];
      mockCreate.mockResolvedValue(textResponse(JSON.stringify(wellFormed)));

      const result = await provider.generateQuizQuestions({
        subject: 'Math',
        topicName: 'Arithmetic',
        difficulty: 'EASY',
        count: 1,
      });

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ model: 'claude-opus-5' }));
      expect(result).toEqual(wellFormed);
    });

    it('throws (not silently returns garbage) on a malformed question response', async () => {
      mockCreate.mockResolvedValue(textResponse(JSON.stringify([{ prompt: 'missing required fields' }])));

      await expect(
        provider.generateQuizQuestions({
          subject: 'Math',
          topicName: 'Arithmetic',
          difficulty: 'EASY',
          count: 1,
        }),
      ).rejects.toThrow();
    });

    it('throws on a response that is not valid JSON at all', async () => {
      mockCreate.mockResolvedValue(textResponse('not json at all'));

      await expect(
        provider.generateQuizQuestions({
          subject: 'Math',
          topicName: 'Arithmetic',
          difficulty: 'EASY',
          count: 1,
        }),
      ).rejects.toThrow();
    });

    it('strips a markdown code fence before parsing JSON', async () => {
      const wellFormed = { narrative: 'Focus on X.', studyOrder: [] };
      mockCreate.mockResolvedValue(textResponse('```json\n' + JSON.stringify(wellFormed) + '\n```'));

      const result = await provider.generateRecommendationNarrative({
        studentFirstName: 'Ada',
        candidates: [],
      });

      expect(result).toEqual(wellFormed);
    });

    it('returns plain text for explainIncorrectAnswer', async () => {
      mockCreate.mockResolvedValue(textResponse('Here is why the answer is correct.'));

      const result = await provider.explainIncorrectAnswer({
        questionPrompt: 'q',
        options: [{ text: 'a', isCorrect: true }],
        selectedAnswerText: 'b',
        correctAnswerText: 'a',
      });

      expect(result).toBe('Here is why the answer is correct.');
    });
  });
});
