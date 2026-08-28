'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { QuestionDto, QuizDto } from '@learnai/shared';
import { QuestionType } from '@learnai/shared';
import { api, ApiError } from '../../../../../../../lib/api-client';
import { AppShell } from '../../../../../../../components/app-shell';
import { Badge } from '../../../../../../../components/ui/badge';
import { Button } from '../../../../../../../components/ui/button';
import { Card, CardTitle } from '../../../../../../../components/ui/card';
import { ErrorState, Skeleton } from '../../../../../../../components/ui/states';

const OPTION_TYPES = new Set([QuestionType.MULTIPLE_CHOICE, QuestionType.TRUE_FALSE, QuestionType.MULTIPLE_ANSWER]);

interface OptionDraft {
  text: string;
  isCorrect: boolean;
}

function QuestionCard({ question, onDeleted }: { question: QuestionDto; onDeleted: (id: string) => void }) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setIsDeleting(true);
    setError(null);
    try {
      await api.delete(`/questions/${question.id}`);
      onDeleted(question.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete question.');
      setIsDeleting(false);
    }
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div>
          <Badge tone="brand">{question.type.replace('_', ' ')}</Badge>
          <p className="mt-2 text-sm font-medium text-slate-900">{question.prompt}</p>
        </div>
        <Button variant="danger" size="sm" isLoading={isDeleting} onClick={handleDelete}>
          Delete
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-2 rounded-md bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
          {error}
        </p>
      )}
      {question.options.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {question.options.map((option) => (
            <li key={option.id} className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-1.5 text-sm text-slate-700">
              <span>{option.text}</span>
              {option.isCorrect && (
                <span className="ml-auto text-xs font-semibold uppercase tracking-wide text-emerald-700">Correct</span>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-slate-400">
        {question.points} point{question.points === 1 ? '' : 's'} · order {question.order}
      </p>
      {question.explanation && <p className="mt-2 text-sm text-slate-500">{question.explanation}</p>}
      {/* TODO: inline question editing (PATCH /questions/:id) not yet wired — delete + re-add for now. */}
    </Card>
  );
}

function AddQuestionForm({ quizId, onCreated }: { quizId: string; onCreated: (q: QuestionDto) => void }) {
  const [type, setType] = useState<QuestionType>(QuestionType.MULTIPLE_CHOICE);
  const [prompt, setPrompt] = useState('');
  const [points, setPoints] = useState('1');
  const [order, setOrder] = useState('0');
  const [topicId, setTopicId] = useState('');
  const [explanation, setExplanation] = useState('');
  const [options, setOptions] = useState<OptionDraft[]>([
    { text: '', isCorrect: false },
    { text: '', isCorrect: false },
  ]);
  const [correctAnswerText, setCorrectAnswerText] = useState('');
  const [acceptableAnswers, setAcceptableAnswers] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleTypeChange(next: QuestionType) {
    setType(next);
    if (next === QuestionType.TRUE_FALSE) {
      setOptions([
        { text: 'True', isCorrect: false },
        { text: 'False', isCorrect: false },
      ]);
    }
  }

  function updateOption(index: number, patch: Partial<OptionDraft>) {
    setOptions((prev) => prev.map((opt, i) => (i === index ? { ...opt, ...patch } : opt)));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!prompt.trim() || !topicId.trim()) return;
    setIsSaving(true);
    setError(null);
    try {
      const base = {
        type,
        prompt: prompt.trim(),
        points: Number(points) || 1,
        order: Number(order) || 0,
        topicId: topicId.trim(),
        explanation: explanation.trim() || undefined,
      };
      const body = OPTION_TYPES.has(type)
        ? {
            ...base,
            options: options
              .filter((o) => o.text.trim())
              .map((o, i) => ({ text: o.text.trim(), isCorrect: o.isCorrect, order: i })),
          }
        : {
            ...base,
            correctAnswerText: correctAnswerText.trim(),
            acceptableAnswers: acceptableAnswers
              .split(',')
              .map((a) => a.trim())
              .filter(Boolean),
          };
      const created = await api.post<QuestionDto>(`/quizzes/${quizId}/questions`, body);
      onCreated(created);
      setPrompt('');
      setExplanation('');
      setCorrectAnswerText('');
      setAcceptableAnswers('');
      setOptions([
        { text: '', isCorrect: false },
        { text: '', isCorrect: false },
      ]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add question.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardTitle>Add question</CardTitle>
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div>
          <label htmlFor="q-type" className="block text-sm font-medium text-slate-700">
            Type
          </label>
          <select
            id="q-type"
            value={type}
            onChange={(e) => handleTypeChange(e.target.value as QuestionType)}
            className="focus-ring mt-1 w-full rounded-lg border border-slate-300 shadow-soft transition px-3 py-2 text-sm"
          >
            {Object.values(QuestionType).map((t) => (
              <option key={t} value={t}>
                {t.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="q-prompt" className="block text-sm font-medium text-slate-700">
            Prompt
          </label>
          <textarea
            id="q-prompt"
            required
            rows={2}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="focus-ring mt-1 w-full rounded-lg border border-slate-300 shadow-soft transition px-3 py-2 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="q-points" className="block text-sm font-medium text-slate-700">
              Points
            </label>
            <input
              id="q-points"
              type="number"
              min={0}
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              className="focus-ring mt-1 w-full rounded-lg border border-slate-300 shadow-soft transition px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="q-order" className="block text-sm font-medium text-slate-700">
              Order
            </label>
            <input
              id="q-order"
              type="number"
              min={0}
              value={order}
              onChange={(e) => setOrder(e.target.value)}
              className="focus-ring mt-1 w-full rounded-lg border border-slate-300 shadow-soft transition px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="q-topic" className="block text-sm font-medium text-slate-700">
              Topic ID
            </label>
            <input
              id="q-topic"
              required
              value={topicId}
              onChange={(e) => setTopicId(e.target.value)}
              className="focus-ring mt-1 w-full rounded-lg border border-slate-300 shadow-soft transition px-3 py-2 text-sm"
            />
          </div>
        </div>

        {OPTION_TYPES.has(type) ? (
          <fieldset>
            <legend className="block text-sm font-medium text-slate-700">Options</legend>
            <div className="mt-2 space-y-2">
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <label htmlFor={`q-opt-${i}`} className="sr-only">
                    Option {i + 1} text
                  </label>
                  <input
                    id={`q-opt-${i}`}
                    value={opt.text}
                    onChange={(e) => updateOption(i, { text: e.target.value })}
                    placeholder={`Option ${i + 1}`}
                    className="focus-ring flex-1 rounded-lg border border-slate-300 shadow-soft transition px-3 py-2 text-sm"
                  />
                  <label className="flex items-center gap-1.5 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={opt.isCorrect}
                      onChange={(e) => updateOption(i, { isCorrect: e.target.checked })}
                      className="focus-ring h-4 w-4 rounded border-slate-300"
                    />
                    Correct
                  </label>
                  {options.length > 2 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setOptions((prev) => prev.filter((_, idx) => idx !== i))}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              ))}
            </div>
            {type !== QuestionType.TRUE_FALSE && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() => setOptions((prev) => [...prev, { text: '', isCorrect: false }])}
              >
                + Add option
              </Button>
            )}
          </fieldset>
        ) : (
          <div className="space-y-3">
            <div>
              <label htmlFor="q-correct-answer" className="block text-sm font-medium text-slate-700">
                Correct answer
              </label>
              <input
                id="q-correct-answer"
                required
                value={correctAnswerText}
                onChange={(e) => setCorrectAnswerText(e.target.value)}
                className="focus-ring mt-1 w-full rounded-lg border border-slate-300 shadow-soft transition px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="q-acceptable" className="block text-sm font-medium text-slate-700">
                Other acceptable answers (comma-separated)
              </label>
              <input
                id="q-acceptable"
                value={acceptableAnswers}
                onChange={(e) => setAcceptableAnswers(e.target.value)}
                className="focus-ring mt-1 w-full rounded-lg border border-slate-300 shadow-soft transition px-3 py-2 text-sm"
              />
            </div>
          </div>
        )}

        <div>
          <label htmlFor="q-explanation" className="block text-sm font-medium text-slate-700">
            Explanation (optional)
          </label>
          <textarea
            id="q-explanation"
            rows={2}
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            className="focus-ring mt-1 w-full rounded-lg border border-slate-300 shadow-soft transition px-3 py-2 text-sm"
          />
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">
            {error}
          </p>
        )}

        <Button type="submit" isLoading={isSaving}>
          Add question
        </Button>
      </form>
    </Card>
  );
}

function AiGenerateForm({ quizId }: { quizId: string }) {
  const [topicId, setTopicId] = useState('');
  const [count, setCount] = useState('3');
  const [difficulty, setDifficulty] = useState<'EASY' | 'MEDIUM' | 'HARD'>('MEDIUM');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!topicId.trim()) return;
    setIsGenerating(true);
    setError(null);
    setSuccess(false);
    try {
      await api.post('/ai/questions/generate', {
        topicId: topicId.trim(),
        quizId,
        count: Number(count) || 1,
        difficulty,
      });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to generate questions.');
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <Card>
      <CardTitle>Generate with AI</CardTitle>
      <form onSubmit={handleSubmit} className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="ai-topic" className="block text-sm font-medium text-slate-700">
            Topic ID
          </label>
          <input
            id="ai-topic"
            required
            value={topicId}
            onChange={(e) => setTopicId(e.target.value)}
            className="focus-ring mt-1 w-48 rounded-lg border border-slate-300 shadow-soft transition px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="ai-count" className="block text-sm font-medium text-slate-700">
            Count
          </label>
          <input
            id="ai-count"
            type="number"
            min={1}
            max={20}
            value={count}
            onChange={(e) => setCount(e.target.value)}
            className="focus-ring mt-1 w-20 rounded-lg border border-slate-300 shadow-soft transition px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="ai-difficulty" className="block text-sm font-medium text-slate-700">
            Difficulty
          </label>
          <select
            id="ai-difficulty"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as 'EASY' | 'MEDIUM' | 'HARD')}
            className="focus-ring mt-1 rounded-lg border border-slate-300 shadow-soft transition px-3 py-2 text-sm"
          >
            <option value="EASY">Easy</option>
            <option value="MEDIUM">Medium</option>
            <option value="HARD">Hard</option>
          </select>
        </div>
        <Button type="submit" isLoading={isGenerating}>
          Generate
        </Button>
      </form>
      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Drafts generated. Review and approve them on the{' '}
          <Link href="/instructor#drafts" className="font-medium underline">
            instructor drafts panel
          </Link>
          .
        </p>
      )}
    </Card>
  );
}

export default function EditQuizPage() {
  const params = useParams<{ id: string; quizId: string }>();
  const { quizId } = params;

  const [quiz, setQuiz] = useState<QuizDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const load = useCallback(() => {
    setIsLoading(true);
    setError(null);
    api
      .get<QuizDto>(`/quizzes/${quizId}`)
      .then(setQuiz)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load quiz.'))
      .finally(() => setIsLoading(false));
  }, [quizId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handlePublish() {
    setIsPublishing(true);
    setPublishError(null);
    try {
      await api.post(`/quizzes/${quizId}/publish`);
      setQuiz((prev) => (prev ? { ...prev, isPublished: true } : prev));
    } catch (err) {
      setPublishError(err instanceof ApiError ? err.message : 'Failed to publish quiz.');
    } finally {
      setIsPublishing(false);
    }
  }

  function handleQuestionCreated(question: QuestionDto) {
    setQuiz((prev) => (prev ? { ...prev, questions: [...prev.questions, question] } : prev));
  }

  function handleQuestionDeleted(id: string) {
    setQuiz((prev) => (prev ? { ...prev, questions: prev.questions.filter((q) => q.id !== id) } : prev));
  }

  return (
    <AppShell>
      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-10 w-1/2" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {!isLoading && error && <ErrorState message={error} onRetry={load} />}

      {!isLoading && !error && quiz && (
        <div className="space-y-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900">{quiz.title}</h1>
              <Badge tone={quiz.isPublished ? 'success' : 'neutral'}>{quiz.isPublished ? 'Published' : 'Draft'}</Badge>
            </div>
            <Button onClick={handlePublish} isLoading={isPublishing} disabled={quiz.isPublished}>
              {quiz.isPublished ? 'Already published' : 'Publish quiz'}
            </Button>
          </div>
          {publishError && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">
              {publishError}
            </p>
          )}

          <section aria-labelledby="questions-heading">
            <h2 id="questions-heading" className="mb-3 text-lg font-semibold text-slate-900">
              Questions ({quiz.questions.length})
            </h2>
            <div className="space-y-4">
              {quiz.questions.map((question) => (
                <QuestionCard key={question.id} question={question} onDeleted={handleQuestionDeleted} />
              ))}
            </div>
            <div className="mt-4">
              <AddQuestionForm quizId={quizId} onCreated={handleQuestionCreated} />
            </div>
          </section>

          <section aria-labelledby="ai-generate-heading">
            <h2 id="ai-generate-heading" className="mb-3 text-lg font-semibold text-slate-900">
              AI question generation
            </h2>
            <AiGenerateForm quizId={quizId} />
          </section>
        </div>
      )}
    </AppShell>
  );
}
