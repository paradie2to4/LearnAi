'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { AnswerInput, QuizAttemptDto, QuizDto } from '@learnai/shared';
import { AttemptStatus } from '@learnai/shared';
import { AppShell } from '../../../components/app-shell';
import { QuestionRenderer } from '../../../components/quiz-question-renderer';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { Skeleton, ErrorState } from '../../../components/ui/states';
import { api, ApiError } from '../../../lib/api-client';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export default function AssessmentPage() {
  const params = useParams<{ id: string }>();
  const quizId = params.id;
  const router = useRouter();

  const [quiz, setQuiz] = useState<QuizDto | null>(null);
  const [attempt, setAttempt] = useState<QuizAttemptDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [answers, setAnswers] = useState<Record<string, AnswerInput>>({});
  const [saveStatus, setSaveStatus] = useState<Record<string, SaveStatus>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);

  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const hasSubmittedRef = useRef(false);
  const answersRef = useRef<Record<string, AnswerInput>>({});
  answersRef.current = answers;

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    hasSubmittedRef.current = false;
    try {
      const quizResult = await api.get<QuizDto>(`/quizzes/${quizId}`);
      setQuiz(quizResult);
      const attemptResult = await api.post<QuizAttemptDto>(`/quizzes/${quizId}/attempts`);
      if (attemptResult.status === AttemptStatus.SUBMITTED) {
        router.replace(`/results/${attemptResult.id}`);
        return;
      }
      setAttempt(attemptResult);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load this assessment.');
    } finally {
      setIsLoading(false);
    }
  }, [quizId, router]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveAnswer(questionId: string, input: AnswerInput) {
    if (!attempt) return;
    setSaveStatus((prev) => ({ ...prev, [questionId]: 'saving' }));
    try {
      await api.patch(`/attempts/${attempt.id}/answers`, input);
      setSaveStatus((prev) => ({ ...prev, [questionId]: 'saved' }));
    } catch {
      setSaveStatus((prev) => ({ ...prev, [questionId]: 'error' }));
    }
  }

  async function handleSubmit() {
    if (!attempt || hasSubmittedRef.current) return;
    hasSubmittedRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);
    // Flush any pending debounced saves immediately before submitting.
    Object.entries(saveTimers.current).forEach(([questionId, timer]) => {
      clearTimeout(timer);
      const pending = answersRef.current[questionId];
      if (pending) {
        saveAnswer(questionId, pending);
      }
    });
    try {
      const result = await api.post<QuizAttemptDto>(`/attempts/${attempt.id}/submit`);
      router.push(`/results/${result.id}`);
    } catch (err) {
      hasSubmittedRef.current = false;
      setIsSubmitting(false);
      setSubmitError(err instanceof ApiError ? err.message : 'Failed to submit your attempt. Please try again.');
    }
  }

  // Countdown timer (client-side UX aid only -- scoring/time enforcement is server-authoritative).
  useEffect(() => {
    if (!quiz?.timeLimitMinutes || !attempt) return;
    const deadline = new Date(attempt.startedAt).getTime() + quiz.timeLimitMinutes * 60_000;

    const tick = () => {
      const secondsLeft = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      setRemainingSeconds(secondsLeft);
      if (secondsLeft <= 0 && !hasSubmittedRef.current) {
        handleSubmit();
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quiz, attempt]);

  useEffect(() => {
    const timers = saveTimers.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  function handleAnswerChange(questionId: string, input: AnswerInput) {
    setAnswers((prev) => ({ ...prev, [questionId]: input }));
    if (saveTimers.current[questionId]) {
      clearTimeout(saveTimers.current[questionId]);
    }
    saveTimers.current[questionId] = setTimeout(() => {
      saveAnswer(questionId, input);
    }, 500);
  }

  const answeredCount = useMemo(
    () =>
      quiz?.questions.filter((q) => {
        const a = answers[q.id];
        return a && ((a.answerText && a.answerText.trim().length > 0) || (a.selectedOptionIds && a.selectedOptionIds.length > 0));
      }).length ?? 0,
    [quiz, answers],
  );

  return (
    <AppShell>
      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-8 w-1/3" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      )}

      {!isLoading && error && <ErrorState message={error} onRetry={load} />}

      {!isLoading && !error && quiz && attempt && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{quiz.title}</h1>
              <p className="text-sm text-slate-500">
                {answeredCount} of {quiz.questions.length} answered
              </p>
            </div>
            {remainingSeconds != null && (
              <div
                role="timer"
                aria-live="polite"
                className={
                  'rounded-lg px-3 py-2 text-sm font-semibold ' +
                  (remainingSeconds <= 60 ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-700')
                }
              >
                Time remaining: {formatTime(remainingSeconds)}
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
            className="space-y-4"
          >
            {quiz.questions
              .slice()
              .sort((a, b) => a.order - b.order)
              .map((question, index) => (
                <Card key={question.id}>
                  <QuestionRenderer
                    question={question}
                    index={index}
                    value={answers[question.id]}
                    onChange={(input) => handleAnswerChange(question.id, input)}
                  />
                  <p className="mt-2 text-xs text-slate-400" aria-live="polite">
                    {saveStatus[question.id] === 'saving' && 'Saving…'}
                    {saveStatus[question.id] === 'saved' && 'Saved'}
                    {saveStatus[question.id] === 'error' && 'Could not save — will retry on submit.'}
                  </p>
                </Card>
              ))}

            {submitError && (
              <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {submitError}
              </p>
            )}

            <div className="flex justify-end">
              <Button type="submit" isLoading={isSubmitting}>
                Submit assessment
              </Button>
            </div>
          </form>
        </div>
      )}
    </AppShell>
  );
}
