import { ConfigService } from '@nestjs/config';
import { QuestionType } from '@learnai/shared';
import { AiUnavailableException } from './ai-unavailable.exception';

const mockGenerateContent = jest.fn();
const mockSendMessage = jest.fn();
const mockStartChat = jest.fn(() => ({ sendMessage: mockSendMessage }));
const mockGetGenerativeModel = jest.fn(() => ({
  generateContent: mockGenerateContent,
  startChat: mockStartChat,
}));

jest.mock('@google/generative-ai', () => ({
  __esModule: true,
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: mockGetGenerativeModel,
  })),
}));

// Imported after the mock so the mocked module is what gets wired in.
import { GeminiProvider } from './gemini.provider';

function configServiceWith(values: Record<string, string>): ConfigService {
  return { get: jest.fn((key: string) => values[key]) } as unknown as ConfigService;
}

function textResult(text: string) {
  return { response: { text: () => text } };
}

describe('GeminiProvider', () => {
  beforeEach(() => {
    mockGenerateContent.mockReset();
    mockSendMessage.mockReset();
    mockGetGenerativeModel.mockClear();
  });

  describe('when GOOGLE_API_KEY is not configured', () => {
    const provider = new GeminiProvider(
      configServiceWith({ GOOGLE_API_KEY: '', AI_MODEL_ID: 'gemini-1.5-flash' }),
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

    it('never calls the Gemini client at all', () => {
      expect(mockGenerateContent).not.toHaveBeenCalled();
      expect(mockGetGenerativeModel).not.toHaveBeenCalled();
    });
  });

  describe('when GOOGLE_API_KEY is configured', () => {
    let provider: GeminiProvider;

    beforeEach(() => {
      provider = new GeminiProvider(
        configServiceWith({ GOOGLE_API_KEY: 'test-key', AI_MODEL_ID: 'gemini-1.5-flash' }),
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
      mockGenerateContent.mockResolvedValue(textResult(JSON.stringify(wellFormed)));

      const result = await provider.generateQuizQuestions({
        subject: 'Math',
        topicName: 'Arithmetic',
        difficulty: 'EASY',
        count: 1,
      });

      expect(mockGetGenerativeModel).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gemini-1.5-flash' }),
      );
      expect(result).toEqual(wellFormed);
    });

    it('throws (not silently returns garbage) on a malformed question response', async () => {
      mockGenerateContent.mockResolvedValue(
        textResult(JSON.stringify([{ prompt: 'missing required fields' }])),
      );

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
      mockGenerateContent.mockResolvedValue(textResult('not json at all'));

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
      mockGenerateContent.mockResolvedValue(textResult('```json\n' + JSON.stringify(wellFormed) + '\n```'));

      const result = await provider.generateRecommendationNarrative({
        studentFirstName: 'Ada',
        candidates: [],
      });

      expect(result).toEqual(wellFormed);
    });

    it('returns plain text for explainIncorrectAnswer', async () => {
      mockGenerateContent.mockResolvedValue(textResult('Here is why the answer is correct.'));

      const result = await provider.explainIncorrectAnswer({
        questionPrompt: 'q',
        options: [{ text: 'a', isCorrect: true }],
        selectedAnswerText: 'b',
        correctAnswerText: 'a',
      });

      expect(result).toBe('Here is why the answer is correct.');
    });

    it('wraps a raw SDK failure (e.g. invalid API key, bad model id) in a clear diagnosable error instead of an opaque crash', async () => {
      mockGenerateContent.mockRejectedValue(
        Object.assign(new Error('API key not valid'), { status: 400, statusText: 'Bad Request' }),
      );

      await expect(
        provider.explainIncorrectAnswer({
          questionPrompt: 'q',
          options: [{ text: 'a', isCorrect: true }],
          selectedAnswerText: 'b',
          correctAnswerText: 'a',
        }),
      ).rejects.toThrow(/AI provider request failed during generate/);
    });

    it('wraps a chat-session failure from answerStudyAssistantQuestion the same way', async () => {
      mockSendMessage.mockRejectedValue(new Error('quota exceeded'));

      await expect(
        provider.answerStudyAssistantQuestion({
          studentFirstName: 'Ada',
          contextSummary: '',
          history: [],
          question: 'hi',
        }),
      ).rejects.toThrow(/AI provider request failed during answerStudyAssistantQuestion/);
    });

    it('answerStudyAssistantQuestion uses a chat session seeded with history', async () => {
      mockSendMessage.mockResolvedValue(textResult('Here is the answer.'));

      const result = await provider.answerStudyAssistantQuestion({
        studentFirstName: 'Ada',
        contextSummary: 'context',
        history: [
          { role: 'user', content: 'first question' },
          { role: 'assistant', content: 'first answer' },
        ],
        question: 'follow up',
      });

      expect(mockStartChat).toHaveBeenCalledWith(
        expect.objectContaining({
          history: [
            { role: 'user', parts: [{ text: 'first question' }] },
            { role: 'model', parts: [{ text: 'first answer' }] },
          ],
        }),
      );
      expect(mockSendMessage).toHaveBeenCalledWith('follow up');
      expect(result).toBe('Here is the answer.');
    });
  });
});
