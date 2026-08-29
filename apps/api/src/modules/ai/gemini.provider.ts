import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import { QuestionType } from '@learnai/shared';
import {
  AiProvider,
  ExplainIncorrectAnswerInput,
  GenerateQuestionsInput,
  GeneratedQuestion,
  RecommendationNarrativeInput,
  RecommendationNarrativeOutput,
  StudyAssistantInput,
} from './ai-provider.interface';
import { AiUnavailableException } from './ai-unavailable.exception';

/**
 * Google Gemini implementation of AiProvider - the default provider, chosen because
 * Google AI Studio issues a genuinely free API key (no credit card, no trial expiry)
 * with a generous daily quota, unlike Anthropic's pay-as-you-go-only API. Swapping
 * back to AnthropicProvider (still in this directory) or any other provider is a
 * one-line change in ai.module.ts - nothing outside this file needs to know which
 * concrete provider is bound to the AI_PROVIDER token.
 *
 * Same structured-output strategy as AnthropicProvider: ask for raw JSON in the
 * prompt (rather than relying on a provider-specific structured-output feature that
 * may not exist in the installed SDK version) and validate the result with Zod,
 * throwing a clear error rather than trusting an unvalidated response.
 */

const generatedOptionSchema = z.object({
  text: z.string(),
  isCorrect: z.boolean(),
});

const generatedQuestionSchema = z.object({
  type: z.nativeEnum(QuestionType),
  prompt: z.string(),
  options: z.array(generatedOptionSchema),
  correctAnswerText: z.string().optional(),
  acceptableAnswers: z.array(z.string()).optional(),
  explanation: z.string(),
});

const generatedQuestionsArraySchema = z.array(generatedQuestionSchema);

const studyOrderItemSchema = z.object({
  topicId: z.string(),
  lessonId: z.string().optional(),
  quizId: z.string().optional(),
  rationale: z.string(),
});

const recommendationNarrativeSchema = z.object({
  narrative: z.string(),
  studyOrder: z.array(studyOrderItemSchema),
});

@Injectable()
export class GeminiProvider implements AiProvider {
  private readonly logger = new Logger(GeminiProvider.name);
  private readonly apiKey: string;
  private readonly model: string;
  private client: GoogleGenerativeAI | null = null;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('GOOGLE_API_KEY') ?? '';
    this.model = this.configService.get<string>('AI_MODEL_ID') ?? 'gemini-1.5-flash';
  }

  async generateQuizQuestions(input: GenerateQuestionsInput): Promise<GeneratedQuestion[]> {
    if (!this.apiKey) {
      throw new AiUnavailableException();
    }

    const types = input.questionTypes?.length ? input.questionTypes : Object.values(QuestionType);

    const system = [
      `You are an expert instructional designer writing quiz questions for a course on "${input.subject}",`,
      `specifically the topic "${input.topicName}". Target difficulty: ${input.difficulty}.`,
      'Every question must be pedagogically sound, unambiguous, and have exactly the correct answer(s) marked.',
    ].join(' ');

    const groundingBlock = input.groundingContent?.length
      ? `Use the following lesson excerpts as grounding so the questions match what was actually taught:\n\n${input.groundingContent
          .map((c, i) => `[Excerpt ${i + 1}]\n${c}`)
          .join('\n\n')}`
      : 'No lesson excerpts were provided; rely on general subject-matter knowledge for this topic.';

    const userMessage = [
      groundingBlock,
      '',
      `Generate exactly ${input.count} quiz question(s), using only these allowed type(s): ${types.join(', ')}.`,
      '',
      'Respond with ONLY a raw JSON array (no markdown fences, no commentary before or after) matching exactly this shape:',
      '[',
      '  {',
      '    "type": "MULTIPLE_CHOICE" | "TRUE_FALSE" | "MULTIPLE_ANSWER" | "SHORT_ANSWER",',
      '    "prompt": "string",',
      '    "options": [{ "text": "string", "isCorrect": true|false }],',
      '    "correctAnswerText": "string (ONLY for SHORT_ANSWER)",',
      '    "acceptableAnswers": ["string", "... (ONLY for SHORT_ANSWER, optional alternate phrasings)"],',
      '    "explanation": "string — brief explanation of the correct answer"',
      '  }',
      ']',
      'Rules: MULTIPLE_CHOICE has exactly one correct option. TRUE_FALSE has exactly two options with exactly one correct. ' +
        'MULTIPLE_ANSWER has at least one correct option and may have more than one. SHORT_ANSWER has an empty "options" array ' +
        'and a required non-empty "correctAnswerText".',
    ].join('\n');

    const text = await this.generate(system, userMessage);
    const parsed = this.parseJson(text, 'generateQuizQuestions');
    const validated = generatedQuestionsArraySchema.safeParse(parsed);
    if (!validated.success) {
      this.logger.error(
        `generateQuizQuestions: model response failed schema validation: ${validated.error.message}`,
      );
      throw new Error('AI provider returned a response that did not match the expected question schema');
    }
    return validated.data;
  }

  async explainIncorrectAnswer(input: ExplainIncorrectAnswerInput): Promise<string> {
    if (!this.apiKey) {
      throw new AiUnavailableException();
    }

    const system =
      'You are a supportive, encouraging tutor helping a student understand a quiz question they answered ' +
      'incorrectly. Be warm, concrete, and concise — never condescending.';

    const optionsText = input.options
      .map((o) => `- "${o.text}"${o.isCorrect ? ' (correct)' : ''}`)
      .join('\n');

    const userMessage = [
      `Question: ${input.questionPrompt}`,
      '',
      `Options:\n${optionsText}`,
      '',
      `The student selected: "${input.selectedAnswerText}"`,
      `The correct answer is: "${input.correctAnswerText}"`,
      input.existingExplanation ? `Existing explanation for grounding: ${input.existingExplanation}` : '',
      '',
      'In about 100-150 words of plain text (no markdown headers or bullet lists), explain: (1) why the correct ' +
        "answer is correct, (2) why the student's choice is a common misconception, and (3) one or two related " +
        'concepts worth reviewing.',
    ]
      .filter((line) => line.length > 0)
      .join('\n');

    const text = await this.generate(system, userMessage);
    return text.trim();
  }

  async generateRecommendationNarrative(
    input: RecommendationNarrativeInput,
  ): Promise<RecommendationNarrativeOutput> {
    if (!this.apiKey) {
      throw new AiUnavailableException();
    }

    const system = [
      `You are a friendly academic advisor writing a short, personalized study plan for ${input.studentFirstName}.`,
      'You must ONLY explain and sequence the topics/lessons/quizzes provided as candidates below.',
      'The candidates are already ranked by severity (most urgent first) — do NOT re-rank or change that numeric ' +
        'ordering, and never invent new topics, lessons, or quizzes that are not present in the candidate list.',
    ].join(' ');

    const candidatesText = input.candidates
      .map((c, i) => {
        const lessons =
          c.candidateLessons.map((l) => `lessonId="${l.lessonId}" ("${l.title}")`).join(', ') || 'none';
        const quizzes =
          c.candidateQuizzes.map((q) => `quizId="${q.quizId}" ("${q.title}")`).join(', ') || 'none';
        return (
          `${i + 1}. topicId="${c.topicId}" ("${c.topicName}"), masteryScore=${c.masteryScore}, severity=${c.severity}\n` +
          `   Candidate lessons: ${lessons}\n` +
          `   Candidate quizzes: ${quizzes}`
        );
      })
      .join('\n');

    const userMessage = [
      'Candidates (pre-ranked by severity, most urgent first — do not change this order):',
      candidatesText,
      '',
      'Respond with ONLY a raw JSON object (no markdown fences, no commentary) matching exactly this shape:',
      '{',
      '  "narrative": "string — a short (2-4 sentence) warm, encouraging summary addressed to the student",',
      '  "studyOrder": [',
      '    { "topicId": "string", "lessonId": "string (optional)", "quizId": "string (optional)", "rationale": "string" }',
      '  ]',
      '}',
      'Every topicId/lessonId/quizId you output must be copied verbatim from the candidates above. Order "studyOrder" ' +
        "to match the candidates' existing severity ranking exactly.",
    ].join('\n');

    const text = await this.generate(system, userMessage);
    const parsed = this.parseJson(text, 'generateRecommendationNarrative');
    const validated = recommendationNarrativeSchema.safeParse(parsed);
    if (!validated.success) {
      this.logger.error(
        `generateRecommendationNarrative: model response failed schema validation: ${validated.error.message}`,
      );
      throw new Error(
        'AI provider returned a response that did not match the expected recommendation narrative schema',
      );
    }
    return validated.data;
  }

  async answerStudyAssistantQuestion(input: StudyAssistantInput): Promise<string> {
    if (!this.apiKey) {
      throw new AiUnavailableException();
    }

    const system = [
      `You are a patient, encouraging study assistant helping ${input.studentFirstName} understand their course material.`,
      'Answer ONLY from the context below plus general tutoring reasoning (e.g. rephrasing or re-deriving a concept ' +
        'already present in the context). Do not draw on outside knowledge of this specific course.',
      'If the answer is not covered by the context, say plainly: "I don\'t have that in your course material yet" ' +
        'rather than guessing or inventing details.',
      '',
      'Student context:',
      input.contextSummary,
    ].join('\n');

    const client = this.getClient();
    const genModel = client.getGenerativeModel({ model: this.model, systemInstruction: system });
    const chat = genModel.startChat({
      history: input.history.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
    });

    const result = await chat.sendMessage(input.question);
    return result.response.text().trim();
  }

  private getClient(): GoogleGenerativeAI {
    if (!this.client) {
      this.client = new GoogleGenerativeAI(this.apiKey);
    }
    return this.client;
  }

  private async generate(systemInstruction: string, userMessage: string): Promise<string> {
    const client = this.getClient();
    const genModel = client.getGenerativeModel({ model: this.model, systemInstruction });
    const result = await genModel.generateContent(userMessage);
    return result.response.text();
  }

  /** Defensively strips a markdown code fence if the model added one despite instructions not to. */
  private parseJson(raw: string, context: string): unknown {
    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '');
    try {
      return JSON.parse(cleaned);
    } catch (error) {
      this.logger.error(`${context}: failed to parse AI response as JSON: ${(error as Error).message}`);
      throw new Error(`AI provider returned invalid JSON for ${context}`);
    }
  }
}
