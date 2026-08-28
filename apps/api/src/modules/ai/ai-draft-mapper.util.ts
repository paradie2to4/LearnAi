import { AiDraftQuestionDto, QuestionOptionDto, QuestionType } from '@learnai/shared';

/**
 * `type`/`status` are typed as plain `string` here (not the shared enums)
 * because the caller passes Prisma-loaded rows: `@prisma/client` generates
 * its `QuestionType`/`DraftStatus` as a plain string-literal union rather
 * than a real TS enum, and TypeScript's string enums are nominal — a bare
 * string literal (even one matching every member) is not directly
 * assignable to `@learnai/shared`'s enum type. Widening the input to
 * `string` and asserting back to the enum at the return site (below) sidesteps
 * that mismatch instead of relying on cross-package enum structural luck.
 */
export interface AiDraftForMapping {
  id: string;
  quizId: string | null;
  topicId: string;
  type: string;
  prompt: string;
  optionsJson: unknown;
  explanation: string | null;
  status: string;
  createdAt: Date;
}

interface RawOption {
  text?: unknown;
  isCorrect?: unknown;
  order?: unknown;
}

/**
 * Maps a persisted AiGeneratedQuestionDraft row to the shared AiDraftQuestionDto.
 * `optionsJson` is untyped `Json` in Prisma, so this defensively normalizes
 * whatever shape AiQuestionGenerationService wrote (see `toOptionsJson`
 * there). SHORT_ANSWER drafts store `correctAnswerText`/`acceptableAnswers`
 * instead of an options array — AiDraftQuestionDto (a locked shared type) has
 * no field for those, so they simply render as an empty `options` array here.
 * Option `id`s are synthesized (`${draftId}-opt-${index}`) since a draft's
 * options aren't real QuestionOption rows until publish.
 */
export function toAiDraftQuestionDto(draft: AiDraftForMapping): AiDraftQuestionDto {
  const raw = draft.optionsJson as { options?: RawOption[] } | null | undefined;
  const rawOptions = Array.isArray(raw?.options) ? raw!.options : [];

  const options: QuestionOptionDto[] = rawOptions.map((option, index) => ({
    id: `${draft.id}-opt-${index}`,
    text: typeof option.text === 'string' ? option.text : '',
    order: typeof option.order === 'number' ? option.order : index,
    isCorrect: typeof option.isCorrect === 'boolean' ? option.isCorrect : undefined,
  }));

  return {
    id: draft.id,
    quizId: draft.quizId,
    topicId: draft.topicId,
    type: draft.type as QuestionType,
    prompt: draft.prompt,
    options,
    explanation: draft.explanation,
    status: draft.status as AiDraftQuestionDto['status'],
    createdAt: draft.createdAt.toISOString(),
  };
}
