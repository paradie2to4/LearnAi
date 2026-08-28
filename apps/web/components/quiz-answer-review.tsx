'use client';

import { useState } from 'react';
import type { AnswerResultDto, QuestionDto } from '@learnai/shared';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { api, ApiError } from '../lib/api-client';

interface AnswerReviewProps {
  index: number;
  answerResult: AnswerResultDto;
  question?: QuestionDto;
}

type ExplainState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'error'; message: string }
  | { status: 'ready'; text: string };

export function AnswerReview({ index, answerResult, question }: AnswerReviewProps) {
  const [explain, setExplain] = useState<ExplainState>({ status: 'idle' });

  async function handleExplain() {
    setExplain({ status: 'loading' });
    try {
      // ASSUMPTION: the route contract is POST /ai/explain/:answerSubmissionId, but no DTO
      // (AnswerResultDto included) exposes a distinct "answer submission" id -- only questionId.
      // We pass questionId here as the best available identifier. If the backend expects a
      // different id (e.g. a dedicated AnswerSubmission row id), this call will need updating.
      const response = await api.post<unknown>(`/ai/explain/${answerResult.questionId}`);
      const text =
        typeof response === 'string'
          ? response
          : ((response as { explanation?: string } | null)?.explanation ?? JSON.stringify(response));
      setExplain({ status: 'ready', text });
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 503) {
        setExplain({ status: 'unavailable' });
      } else {
        setExplain({
          status: 'error',
          message: err instanceof ApiError ? err.message : 'Something went wrong requesting an explanation.',
        });
      }
    }
  }

  const correctOptionIds = new Set(answerResult.correctOptionIds ?? []);

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">
          {index + 1}. {question?.prompt ?? 'Question'}
        </p>
        <Badge tone={answerResult.isCorrect ? 'success' : 'danger'}>
          {answerResult.isCorrect ? 'Correct' : 'Incorrect'}
        </Badge>
      </div>

      <p className="mt-1 text-xs text-slate-500">
        {answerResult.pointsAwarded} {answerResult.pointsAwarded === 1 ? 'point' : 'points'} awarded
        {question ? ` of ${question.points}` : ''}
      </p>

      {question && question.options.length > 0 && (
        <ul className="mt-3 space-y-1">
          {question.options
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((option) => (
              <li key={option.id} className="flex items-center gap-2 text-sm text-slate-700">
                <span>{option.text}</span>
                {correctOptionIds.has(option.id) && <Badge tone="success">Correct answer</Badge>}
              </li>
            ))}
        </ul>
      )}

      {answerResult.correctAnswerText && (
        <p className="mt-2 text-sm text-slate-700">
          <span className="font-medium">Expected answer:</span> {answerResult.correctAnswerText}
        </p>
      )}

      {answerResult.explanation && (
        <p className="mt-2 rounded-md bg-slate-50 p-3 text-sm text-slate-600">{answerResult.explanation}</p>
      )}

      {!answerResult.isCorrect && (
        <div className="mt-3">
          {explain.status === 'idle' && (
            <Button variant="secondary" size="sm" onClick={handleExplain}>
              Explain this
            </Button>
          )}
          {explain.status === 'loading' && (
            <Button variant="secondary" size="sm" isLoading>
              Explain this
            </Button>
          )}
          {explain.status === 'ready' && (
            <p className="rounded-md bg-brand-50 p-3 text-sm text-brand-900">{explain.text}</p>
          )}
          {explain.status === 'unavailable' && (
            <p className="text-sm text-slate-500">AI explanations aren&apos;t available right now.</p>
          )}
          {explain.status === 'error' && (
            <div className="space-y-1">
              <p role="alert" className="text-sm text-red-600">
                {explain.message}
              </p>
              <Button variant="secondary" size="sm" onClick={handleExplain}>
                Try again
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
