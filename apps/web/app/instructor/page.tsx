'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { AiDraftQuestionDto, CourseSummaryDto, SubjectDto } from '@learnai/shared';
import { useAuth } from '../../lib/auth-context';
import { api, ApiError } from '../../lib/api-client';
import { AppShell } from '../../components/app-shell';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardDescription, CardTitle } from '../../components/ui/card';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/states';
import { DraftReviewCard } from '../../components/draft-review-card';

export default function InstructorHomePage() {
  const { user } = useAuth();

  const [courses, setCourses] = useState<CourseSummaryDto[] | null>(null);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [coursesError, setCoursesError] = useState<string | null>(null);

  const [drafts, setDrafts] = useState<AiDraftQuestionDto[] | null>(null);
  const [draftsLoading, setDraftsLoading] = useState(true);
  const [draftsError, setDraftsError] = useState<string | null>(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [subjects, setSubjects] = useState<SubjectDto[] | null>(null);

  useEffect(() => {
    api
      .get<SubjectDto[]>('/subjects')
      .then((result) => {
        setSubjects(result);
        if (result.length > 0) setSubjectId((current) => current || result[0].id);
      })
      .catch(() => setSubjects([]));
  }, []);

  const loadCourses = useCallback(() => {
    if (!user) return;
    setCoursesLoading(true);
    setCoursesError(null);
    // The backend may or may not support ?instructorId=me — we pass it as a hint
    // and additionally filter client-side by instructor.id, so this works either way.
    api
      .get<CourseSummaryDto[]>('/courses?instructorId=me')
      .then((all) => setCourses(all.filter((c) => c.instructor.id === user.id)))
      .catch((err) => setCoursesError(err instanceof ApiError ? err.message : 'Failed to load your courses.'))
      .finally(() => setCoursesLoading(false));
  }, [user]);

  const loadDrafts = useCallback(() => {
    setDraftsLoading(true);
    setDraftsError(null);
    api
      .get<AiDraftQuestionDto[]>('/ai/drafts?status=PENDING')
      .then(setDrafts)
      .catch((err) => setDraftsError(err instanceof ApiError ? err.message : 'Failed to load pending drafts.'))
      .finally(() => setDraftsLoading(false));
  }, []);

  useEffect(() => {
    loadCourses();
    loadDrafts();
  }, [loadCourses, loadDrafts]);

  async function handleCreateCourse(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    if (!subjectId.trim()) {
      setCreateError('No subject is selected — a subject must exist before you can create a course.');
      return;
    }
    setIsCreating(true);
    setCreateError(null);
    try {
      const created = await api.post<CourseSummaryDto>('/courses', {
        title: title.trim(),
        description: description.trim(),
        subjectId: subjectId.trim(),
      });
      setCourses((prev) => (prev ? [created, ...prev] : [created]));
      setTitle('');
      setDescription('');
      setSubjectId('');
      setShowCreateForm(false);
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Failed to create course.');
    } finally {
      setIsCreating(false);
    }
  }

  function handleDraftResolved(draftId: string) {
    setDrafts((prev) => (prev ? prev.filter((d) => d.id !== draftId) : prev));
  }

  return (
    <AppShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Instructor dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">Manage your courses and review AI-generated questions.</p>
        </div>
        <Button onClick={() => setShowCreateForm((v) => !v)}>{showCreateForm ? 'Cancel' : 'Create course'}</Button>
      </div>

      {showCreateForm && (
        <Card className="mt-4">
          <CardTitle>New course</CardTitle>
          <form onSubmit={handleCreateCourse} className="mt-4 space-y-4">
            <div>
              <label htmlFor="course-title" className="block text-sm font-medium text-slate-700">
                Title
              </label>
              <input
                id="course-title"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="focus-ring mt-1 w-full rounded-lg border border-slate-300 shadow-soft transition px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="course-description" className="block text-sm font-medium text-slate-700">
                Description
              </label>
              <textarea
                id="course-description"
                required
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="focus-ring mt-1 w-full rounded-lg border border-slate-300 shadow-soft transition px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="course-subject" className="block text-sm font-medium text-slate-700">
                Subject
              </label>
              {subjects === null ? (
                <Skeleton className="mt-1 h-9 w-full" />
              ) : subjects.length === 0 ? (
                <p className="mt-1 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-inset ring-amber-200">
                  No subjects exist in the database yet, so a course can&apos;t be created — an admin needs to seed
                  or create at least one subject first.
                </p>
              ) : (
                <select
                  id="course-subject"
                  required
                  value={subjectId}
                  onChange={(e) => setSubjectId(e.target.value)}
                  className="focus-ring mt-1 w-full rounded-lg border border-slate-300 shadow-soft transition bg-white px-3 py-2 text-sm"
                >
                  {subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {createError && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">
                {createError}
              </p>
            )}
            <Button type="submit" isLoading={isCreating} disabled={subjects === null || subjects.length === 0}>
              Create course
            </Button>
          </form>
        </Card>
      )}

      <section className="mt-8" aria-labelledby="courses-heading">
        <h2 id="courses-heading" className="mb-3 text-lg font-semibold text-slate-900">
          Your courses
        </h2>
        {coursesLoading && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        )}
        {!coursesLoading && coursesError && <ErrorState message={coursesError} onRetry={loadCourses} />}
        {!coursesLoading &&
          !coursesError &&
          (!courses || courses.length === 0 ? (
            <EmptyState title="No courses yet" description="Create your first course to start building content." />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {courses.map((course) => (
                <Link key={course.id} href={`/instructor/courses/${course.id}/edit`} className="focus-ring block rounded-xl">
                  <Card className="h-full transition hover:border-brand-300">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <CardTitle>{course.title}</CardTitle>
                      <Badge tone={course.isPublished ? 'success' : 'neutral'}>
                        {course.isPublished ? 'Published' : 'Draft'}
                      </Badge>
                    </div>
                    <CardDescription>{course.description}</CardDescription>
                    {typeof course.enrollmentCount === 'number' && (
                      <p className="mt-2 text-xs text-slate-400">{course.enrollmentCount} enrolled</p>
                    )}
                  </Card>
                </Link>
              ))}
            </div>
          ))}
      </section>

      <section id="drafts" className="mt-10 scroll-mt-6" aria-labelledby="drafts-heading">
        <div className="mb-3 flex items-center gap-2">
          <h2 id="drafts-heading" className="text-lg font-semibold text-slate-900">
            Pending AI drafts
          </h2>
          {drafts && drafts.length > 0 && <Badge tone="warning">{drafts.length}</Badge>}
        </div>
        {draftsLoading && (
          <div className="space-y-3">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        )}
        {!draftsLoading && draftsError && <ErrorState message={draftsError} onRetry={loadDrafts} />}
        {!draftsLoading &&
          !draftsError &&
          (!drafts || drafts.length === 0 ? (
            <EmptyState
              title="No pending drafts"
              description="AI-generated questions awaiting review will show up here."
            />
          ) : (
            <div className="space-y-4">
              {drafts.map((draft) => (
                <DraftReviewCard key={draft.id} draft={draft} onResolved={handleDraftResolved} />
              ))}
            </div>
          ))}
      </section>
    </AppShell>
  );
}
