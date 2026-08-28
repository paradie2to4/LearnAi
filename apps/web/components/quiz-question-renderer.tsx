'use client';

import type { AnswerInput, QuestionDto } from '@learnai/shared';
import { QuestionType } from '@learnai/shared';
import clsx from 'clsx';

interface QuestionRendererProps {
  question: QuestionDto;
  index: number;
  value: AnswerInput | undefined;
  onChange: (input: AnswerInput) => void;
}

/**
 * Renders a single quiz question as an accessible form control matching its QuestionType.
 * MULTIPLE_CHOICE / TRUE_FALSE -> radio group (single selectedOptionIds entry)
 * MULTIPLE_ANSWER -> checkbox group (selectedOptionIds array)
 * SHORT_ANSWER -> text input (answerText)
 */
export function QuestionRenderer({ question, index, value, onChange }: QuestionRendererProps) {
  const selectedOptionIds = value?.selectedOptionIds ?? [];

  function handleSingleSelect(optionId: string) {
    onChange({ questionId: question.id, selectedOptionIds: [optionId] });
  }

  function handleMultiSelect(optionId: string, checked: boolean) {
    const next = checked
      ? Array.from(new Set([...selectedOptionIds, optionId]))
      : selectedOptionIds.filter((id) => id !== optionId);
    onChange({ questionId: question.id, selectedOptionIds: next });
  }

  function handleTextChange(text: string) {
    onChange({ questionId: question.id, answerText: text });
  }

  const sortedOptions = question.options.slice().sort((a, b) => a.order - b.order);

  return (
    <fieldset>
      <legend className="text-sm font-semibold text-slate-900">
        {index + 1}. {question.prompt}
        <span className="ml-2 text-xs font-normal text-slate-400">
          ({question.points} {question.points === 1 ? 'point' : 'points'})
        </span>
      </legend>

      {(question.type === QuestionType.MULTIPLE_CHOICE || question.type === QuestionType.TRUE_FALSE) && (
        <div className="mt-3 space-y-2">
          {sortedOptions.map((option) => {
            const inputId = `q-${question.id}-opt-${option.id}`;
            const isChecked = selectedOptionIds.includes(option.id);
            return (
              <label
                key={option.id}
                htmlFor={inputId}
                className={clsx(
                  'flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition',
                  isChecked
                    ? 'border-brand-300 bg-brand-50 text-brand-900'
                    : 'border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50',
                )}
              >
                <input
                  id={inputId}
                  type="radio"
                  name={`q-${question.id}`}
                  checked={isChecked}
                  onChange={() => handleSingleSelect(option.id)}
                  className="focus-ring h-4 w-4 text-brand-600"
                />
                {option.text}
              </label>
            );
          })}
        </div>
      )}

      {question.type === QuestionType.MULTIPLE_ANSWER && (
        <div className="mt-3 space-y-2">
          {sortedOptions.map((option) => {
            const inputId = `q-${question.id}-opt-${option.id}`;
            const isChecked = selectedOptionIds.includes(option.id);
            return (
              <label
                key={option.id}
                htmlFor={inputId}
                className={clsx(
                  'flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition',
                  isChecked
                    ? 'border-brand-300 bg-brand-50 text-brand-900'
                    : 'border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50',
                )}
              >
                <input
                  id={inputId}
                  type="checkbox"
                  checked={isChecked}
                  onChange={(e) => handleMultiSelect(option.id, e.target.checked)}
                  className="focus-ring h-4 w-4 rounded text-brand-600"
                />
                {option.text}
              </label>
            );
          })}
        </div>
      )}

      {question.type === QuestionType.SHORT_ANSWER && (
        <div className="mt-3">
          <label htmlFor={`q-${question.id}-text`} className="sr-only">
            Your answer to question {index + 1}
          </label>
          <input
            id={`q-${question.id}-text`}
            type="text"
            value={value?.answerText ?? ''}
            onChange={(e) => handleTextChange(e.target.value)}
            className="focus-ring w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-soft transition placeholder:text-slate-400"
            placeholder="Type your answer"
          />
        </div>
      )}
    </fieldset>
  );
}
