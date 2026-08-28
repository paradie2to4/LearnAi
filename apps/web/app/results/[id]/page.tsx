'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { QuestionDto, QuizAttemptDto, QuizDto } from '@learnai/shared';
import { AppShell } from '../../../components/app-shell';
import { AnswerReview } from '../../../components/quiz-answer-review';
import { Badge } from '../../../components/ui/badge';
import { Card, CardTitle } from '../../../components/ui/card';
import { Skeleton, ErrorState, EmptyState } from '../../../components/ui/states';
import { api, ApiError } from '../../../lib/api-client';

export default function ResultsPage() {
  const params = useParams<{ id: string }>();
  const attemptId = params.id;

  const [attempt, setAttempt] = useState<QuizAttemptDto | null>(null);
  const [quiz, setQuiz] = useState<QuizDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const attemptResult = await api.get<QuizAttemptDto>(`/attempts/${attemptId}`);
      setAttempt(attemptResult);
      try {
        const quizResult = await api.get<QuizDto>(`/quizzes/${attemptResult.quizId}`);
        setQuiz(quizResult);
      } catch {
        setQuiz(null);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load your results.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId]);

  const questionsById = new Map<string, QuestionDto>((quiz?.questions ?? []).map((q) => [q.id, q]));

  return (
    <AppShell>
      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-10 w-1/2" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      )}

      {!isLoading && error && <ErrorState message={error} onRetry={load} />}

      {!isLoading && !error && attempt && (
        <div className="space-y-6">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <CardTitle>{quiz?.title ?? 'Assessment results'}</CardTitle>
                <p className="mt-1 text-sm text-slate-500">
                  Score: {attempt.score ?? '—'} / {attempt.maxScore ?? '—'}
                </p>
              </div>
              <Badge tone={attempt.passed ? 'success' : 'danger'}>{attempt.passed ? 'Passed' : 'Failed'}</Badge>
            </div>
          </Card>

          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">Question review</h2>
            {!attempt.answers || attempt.answers.length === 0 ? (
              <EmptyState
                title="No detailed results available"
                description="This attempt doesn't have a per-question breakdown yet."
              />
            ) : (
              attempt.answers.map((answerResult, i) => (
                <AnswerReview
                  key={answerResult.questionId}
                  index={i}
                  answerResult={answerResult}
                  question={questionsById.get(answerResult.questionId)}
                />
              ))
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
