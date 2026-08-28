import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
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
 * Structured-output approach: JSON-in-prompt + Zod validation.
 *
 * The brief's preferred path (`client.messages.parse()` with
 * `zodOutputFormat(...)`) requires an `@anthropic-ai/sdk` version that ships
 * `messages.parse` / `output_config.format` in its type definitions. The
 * version actually installed in this workspace (0.32.1 — checked against
 * `node_modules/@anthropic-ai/sdk/resources/messages.d.ts`) predates both:
 * `Messages` only declares `create`/`stream`, and neither `output_config`
 * nor a `zodOutputFormat` helper exist anywhere in the package. Rather than
 * depend on an SDK surface that isn't actually present (which would fail to
 * compile), every structured-output method below instructs the model to
 * respond with ONLY a raw JSON value in a precisely-described shape, calls
 * the plain `messages.create`, extracts the text block, `JSON.parse`s it
 * defensively, and validates the result with a Zod schema — throwing a
 * clear error (not silently returning garbage) on any malformed response.
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
export class AnthropicProvider implements AiProvider {
  private readonly logger = new Logger(AnthropicProvider.name);
  private readonly apiKey: string;
  private readonly model: string;
  private client: Anthropic | null = null;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('ANTHROPIC_API_KEY') ?? '';
    this.model = this.configService.get<string>('AI_MODEL_ID') ?? 'claude-opus-5';
  }

  async generateQuizQuestions(input: GenerateQuestionsInput): Promise<GeneratedQuestion[]> {
    if (!this.apiKey) {
      throw new AiUnavailableException();
    }
    const client = this.getClient();

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

    const response = await client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system,
      messages: [{ role: 'user', content: userMessage }],
    });

    const parsed = this.parseJson(this.extractText(response), 'generateQuizQuestions');
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
    const client = this.getClient();

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

    const response = await client.messages.create({
      model: this.model,
      max_tokens: 600,
      system,
      messages: [{ role: 'user', content: userMessage }],
    });

    return this.extractText(response).trim();
  }

  async generateRecommendationNarrative(
    input: RecommendationNarrativeInput,
  ): Promise<RecommendationNarrativeOutput> {
    if (!this.apiKey) {
      throw new AiUnavailableException();
    }
    const client = this.getClient();

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

    const response = await client.messages.create({
      model: this.model,
      max_tokens: 2048,
      system,
      messages: [{ role: 'user', content: userMessage }],
    });

    const parsed = this.parseJson(this.extractText(response), 'generateRecommendationNarrative');
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
    const client = this.getClient();

    // NOTE on prompt caching: ideally the system/context block below would
    // carry `cache_control: { type: 'ephemeral' }` since contextSummary is
    // stable across turns of the same conversation. The installed
    // @anthropic-ai/sdk version (0.32.1)'s `TextBlockParam` type predates
    // that field entirely (confirmed against the shipped .d.ts), so it's
    // omitted here rather than forced through with an unsafe cast — no
    // functional impact, just a missed cost optimization until the SDK is
    // upgraded.
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

    const messages: Anthropic.MessageParam[] = [
      ...input.history.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: input.question },
    ];

    const response = await client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system,
      messages,
    });

    return this.extractText(response).trim();
  }

  private getClient(): Anthropic {
    if (!this.client) {
      this.client = new Anthropic({ apiKey: this.apiKey });
    }
    return this.client;
  }

  private extractText(message: Anthropic.Message): string {
    const textBlock = message.content.find((block): block is Anthropic.TextBlock => block.type === 'text');
    if (!textBlock) {
      throw new Error('AI provider response contained no text content block');
    }
    return textBlock.text;
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
