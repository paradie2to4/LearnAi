'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { CourseDetailDto, LessonSummaryDto, ModuleDto, QuizDto } from '@learnai/shared';
import { api, ApiError } from '../../../../../lib/api-client';
import { AppShell } from '../../../../../components/app-shell';
import { Badge } from '../../../../../components/ui/badge';
import { Button } from '../../../../../components/ui/button';
import { Card, CardTitle } from '../../../../../components/ui/card';
import { ErrorState, Skeleton } from '../../../../../components/ui/states';

function AddLessonForm({
  moduleId,
  nextOrder,
  onCreated,
}: {
  moduleId: string;
  nextOrder: number;
  onCreated: (lesson: LessonSummaryDto) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [estimatedMinutes, setEstimatedMinutes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setIsSaving(true);
    setError(null);
    try {
      const lesson = await api.post<LessonSummaryDto>(`/modules/${moduleId}/lessons`, {
        title: title.trim(),
        content,
        order: nextOrder,
        estimatedMinutes: estimatedMinutes ? Number(estimatedMinutes) : undefined,
      });
      onCreated(lesson);
      setTitle('');
      setContent('');
      setEstimatedMinutes('');
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add lesson.');
    } finally {
      setIsSaving(false);
    }
  }

  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        + Add lesson
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 space-y-3 rounded-lg border border-slate-200 p-3">
      <div>
        <label htmlFor={`lesson-title-${moduleId}`} className="block text-xs font-medium text-slate-700">
          Lesson title
        </label>
        <input
          id={`lesson-title-${moduleId}`}
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="focus-ring mt-1 w-full rounded-lg border border-slate-300 shadow-soft transition px-2.5 py-1.5 text-sm"
        />
      </div>
      <div>
        <label htmlFor={`lesson-content-${moduleId}`} className="block text-xs font-medium text-slate-700">
          Content
        </label>
        <textarea
          id={`lesson-content-${moduleId}`}
          rows={3}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="focus-ring mt-1 w-full rounded-lg border border-slate-300 shadow-soft transition px-2.5 py-1.5 text-sm"
        />
      </div>
      <div>
        <label htmlFor={`lesson-minutes-${moduleId}`} className="block text-xs font-medium text-slate-700">
          Estimated minutes
        </label>
        <input
          id={`lesson-minutes-${moduleId}`}
          type="number"
          min={0}
          value={estimatedMinutes}
          onChange={(e) => setEstimatedMinutes(e.target.value)}
          className="focus-ring mt-1 w-32 rounded-lg border border-slate-300 shadow-soft transition px-2.5 py-1.5 text-sm"
        />
      </div>
      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" isLoading={isSaving}>
          Save lesson
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function ModuleCard({ module: mod, onLessonCreated, onDeleted }: {
  module: ModuleDto;
  onLessonCreated: (moduleId: string, lesson: LessonSummaryDto) => void;
  onDeleted: (moduleId: string) => void;
}) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setIsDeleting(true);
    setError(null);
    try {
      await api.delete(`/modules/${mod.id}`);
      onDeleted(mod.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete module.');
      setIsDeleting(false);
    }
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <CardTitle>{mod.title}</CardTitle>
        <Button variant="danger" size="sm" isLoading={isDeleting} onClick={handleDelete}>
          Delete
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-2 rounded-md bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
          {error}
        </p>
      )}
      {mod.lessons.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {mod.lessons.map((lesson) => (
            <li key={lesson.id} className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {lesson.title}
              {typeof lesson.estimatedMinutes === 'number' && (
                <span className="ml-2 text-xs text-slate-400">{lesson.estimatedMinutes} min</span>
              )}
              {/* TODO: inline content editing needs a GET /lessons/:id endpoint (list view omits content). */}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-slate-400">No lessons yet.</p>
      )}
      <div className="mt-3">
        <AddLessonForm
          moduleId={mod.id}
          nextOrder={mod.lessons.length}
          onCreated={(lesson) => onLessonCreated(mod.id, lesson)}
        />
      </div>
    </Card>
  );
}

function AddModuleForm({ courseId, nextOrder, onCreated }: { courseId: string; nextOrder: number; onCreated: (mod: ModuleDto) => void }) {
  const [title, setTitle] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setIsSaving(true);
    setError(null);
    try {
      const created = await api.post<ModuleDto>(`/courses/${courseId}/modules`, { title: title.trim(), order: nextOrder });
      onCreated({ ...created, lessons: created.lessons ?? [] });
      setTitle('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add module.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
      <div className="flex-1">
        <label htmlFor="new-module-title" className="block text-sm font-medium text-slate-700">
          New module title
        </label>
        <input
          id="new-module-title"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="focus-ring mt-1 w-full rounded-lg border border-slate-300 shadow-soft transition px-3 py-2 text-sm"
        />
      </div>
      <Button type="submit" isLoading={isSaving}>
        Add module
      </Button>
      {error && (
        <p role="alert" className="w-full rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">
          {error}
        </p>
      )}
    </form>
  );
}

function CreateQuizForm({ courseId, onCreated }: { courseId: string; onCreated: (quiz: QuizDto) => void }) {
  const [title, setTitle] = useState('');
  const [passingScore, setPassingScore] = useState('70');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setIsSaving(true);
    setError(null);
    try {
      const created = await api.post<QuizDto>('/quizzes', {
        title: title.trim(),
        courseId,
        passingScore: Number(passingScore) || undefined,
      });
      onCreated(created);
      setTitle('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create quiz.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
      <div className="flex-1">
        <label htmlFor="new-quiz-title" className="block text-sm font-medium text-slate-700">
          New quiz title
        </label>
        <input
          id="new-quiz-title"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="focus-ring mt-1 w-full rounded-lg border border-slate-300 shadow-soft transition px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="new-quiz-passing" className="block text-sm font-medium text-slate-700">
          Passing score
        </label>
        <input
          id="new-quiz-passing"
          type="number"
          min={0}
          max={100}
          value={passingScore}
          onChange={(e) => setPassingScore(e.target.value)}
          className="focus-ring mt-1 w-24 rounded-lg border border-slate-300 shadow-soft transition px-3 py-2 text-sm"
        />
      </div>
      <Button type="submit" isLoading={isSaving}>
        Create quiz
      </Button>
      {error && (
        <p role="alert" className="w-full rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">
          {error}
        </p>
      )}
    </form>
  );
}

export default function EditCoursePage() {
  const params = useParams<{ id: string }>();
  const courseId = params.id;

  const [course, setCourse] = useState<CourseDetailDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);

  // Quizzes created in this session. There is no GET-quizzes-by-course endpoint
  // in scope, so previously created quizzes aren't listed here on reload — only
  // ones created during this visit. TODO: wire a real list once that endpoint exists.
  const [sessionQuizzes, setSessionQuizzes] = useState<QuizDto[]>([]);

  const load = useCallback(() => {
    setIsLoading(true);
    setError(null);
    api
      .get<CourseDetailDto>(`/courses/${courseId}`)
      .then((data) => {
        setCourse(data);
        setTitle(data.title);
        setDescription(data.description);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load course.'))
      .finally(() => setIsLoading(false));
  }, [courseId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSaveDetails(event: FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    setSaveError(null);
    try {
      const updated = await api.patch<CourseDetailDto>(`/courses/${courseId}`, { title, description });
      setCourse((prev) => (prev ? { ...prev, ...updated } : updated));
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Failed to save changes.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handlePublish() {
    setIsPublishing(true);
    try {
      await api.post(`/courses/${courseId}/publish`);
      setCourse((prev) => (prev ? { ...prev, isPublished: true } : prev));
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Failed to publish course.');
    } finally {
      setIsPublishing(false);
    }
  }

  function handleModuleCreated(mod: ModuleDto) {
    setCourse((prev) => (prev ? { ...prev, modules: [...prev.modules, mod] } : prev));
  }

  function handleModuleDeleted(moduleId: string) {
    setCourse((prev) => (prev ? { ...prev, modules: prev.modules.filter((m) => m.id !== moduleId) } : prev));
  }

  function handleLessonCreated(moduleId: string, lesson: LessonSummaryDto) {
    setCourse((prev) =>
      prev
        ? {
            ...prev,
            modules: prev.modules.map((m) => (m.id === moduleId ? { ...m, lessons: [...m.lessons, lesson] } : m)),
          }
        : prev,
    );
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

      {!isLoading && !error && course && (
        <div className="space-y-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900">{course.title}</h1>
              <Badge tone={course.isPublished ? 'success' : 'neutral'}>
                {course.isPublished ? 'Published' : 'Draft'}
              </Badge>
            </div>
            <Button onClick={handlePublish} isLoading={isPublishing} disabled={course.isPublished}>
              {course.isPublished ? 'Already published' : 'Publish course'}
            </Button>
          </div>

          <Card>
            <CardTitle>Course details</CardTitle>
            <form onSubmit={handleSaveDetails} className="mt-4 space-y-4">
              <div>
                <label htmlFor="edit-title" className="block text-sm font-medium text-slate-700">
                  Title
                </label>
                <input
                  id="edit-title"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="focus-ring mt-1 w-full rounded-lg border border-slate-300 shadow-soft transition px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="edit-description" className="block text-sm font-medium text-slate-700">
                  Description
                </label>
                <textarea
                  id="edit-description"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="focus-ring mt-1 w-full rounded-lg border border-slate-300 shadow-soft transition px-3 py-2 text-sm"
                />
              </div>
              {saveError && (
                <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">
                  {saveError}
                </p>
              )}
              <Button type="submit" isLoading={isSaving}>
                Save changes
              </Button>
            </form>
          </Card>

          <section aria-labelledby="modules-heading">
            <h2 id="modules-heading" className="mb-3 text-lg font-semibold text-slate-900">
              Modules & lessons
            </h2>
            <div className="space-y-4">
              {course.modules.map((mod) => (
                <ModuleCard key={mod.id} module={mod} onLessonCreated={handleLessonCreated} onDeleted={handleModuleDeleted} />
              ))}
            </div>
            <div className="mt-4">
              <AddModuleForm courseId={courseId} nextOrder={course.modules.length} onCreated={handleModuleCreated} />
            </div>
          </section>

          <section aria-labelledby="quizzes-heading">
            <h2 id="quizzes-heading" className="mb-3 text-lg font-semibold text-slate-900">
              Quizzes
            </h2>
            {sessionQuizzes.length > 0 && (
              <ul className="mb-4 space-y-2">
                {sessionQuizzes.map((quiz) => (
                  <li key={quiz.id}>
                    <Link
                      href={`/instructor/courses/${courseId}/quizzes/${quiz.id}/edit`}
                      className="focus-ring inline-block rounded-md text-sm font-medium text-brand-700 hover:underline"
                    >
                      {quiz.title} — manage questions
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <CreateQuizForm courseId={courseId} onCreated={(quiz) => setSessionQuizzes((prev) => [...prev, quiz])} />
          </section>
        </div>
      )}
    </AppShell>
  );
}
