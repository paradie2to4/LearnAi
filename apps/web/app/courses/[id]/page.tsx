'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { CourseDetailDto, EnrollmentDto, LessonDto } from '@learnai/shared';
import { useAuth } from '../../../lib/auth-context';
import { api, ApiError } from '../../../lib/api-client';
import { AppShell } from '../../../components/app-shell';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card, CardTitle } from '../../../components/ui/card';
import { Skeleton, EmptyState, ErrorState } from '../../../components/ui/states';

export default function CourseDetailPage() {
  const params = useParams<{ id: string }>();
  const courseId = params.id;
  const { user } = useAuth();

  const [course, setCourse] = useState<CourseDetailDto | null>(null);
  const [enrollments, setEnrollments] = useState<EnrollmentDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [enrollError, setEnrollError] = useState<string | null>(null);

  const [expandedLessonId, setExpandedLessonId] = useState<string | null>(null);
  const [lessonContent, setLessonContent] = useState<Record<string, LessonDto>>({});
  const [lessonLoadingId, setLessonLoadingId] = useState<string | null>(null);
  const [lessonError, setLessonError] = useState<Record<string, string>>({});
  const [completedLessonIds, setCompletedLessonIds] = useState<Set<string>>(new Set());
  const [completingLessonId, setCompletingLessonId] = useState<string | null>(null);

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const courseResult = await api.get<CourseDetailDto>(`/courses/${courseId}`);
      setCourse(courseResult);
      const initiallyCompleted = new Set<string>();
      courseResult.modules.forEach((m) =>
        m.lessons.forEach((l) => {
          if (l.completed) initiallyCompleted.add(l.id);
        }),
      );
      setCompletedLessonIds(initiallyCompleted);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load this course.');
      setIsLoading(false);
      return;
    }
    try {
      const enrollmentsResult = await api.get<EnrollmentDto[]>('/enrollments/me');
      setEnrollments(enrollmentsResult);
    } catch {
      setEnrollments([]);
    }
    setIsLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  const isEnrolled = enrollments.some((e) => e.courseId === courseId);
  const isOwningInstructor = !!user && user.role === 'INSTRUCTOR' && course?.instructor.id === user.id;
  const isAdmin = user?.role === 'ADMIN';
  const canViewContent = isEnrolled || isOwningInstructor || isAdmin;
  const canEnroll = user?.role === 'STUDENT' && !isEnrolled;

  async function handleEnroll() {
    setEnrollError(null);
    setIsEnrolling(true);
    try {
      const enrollment = await api.post<EnrollmentDto>(`/courses/${courseId}/enroll`);
      setEnrollments((prev) => [...prev, enrollment]);
    } catch (err) {
      setEnrollError(err instanceof ApiError ? err.message : 'Could not enroll. Please try again.');
    } finally {
      setIsEnrolling(false);
    }
  }

  async function loadLessonContent(lessonId: string) {
    setLessonLoadingId(lessonId);
    setLessonError((prev) => {
      const next = { ...prev };
      delete next[lessonId];
      return next;
    });
    try {
      const lesson = await api.get<LessonDto>(`/lessons/${lessonId}`);
      setLessonContent((prev) => ({ ...prev, [lessonId]: lesson }));
    } catch (err) {
      setLessonError((prev) => ({
        ...prev,
        [lessonId]: err instanceof ApiError ? err.message : 'Failed to load lesson content.',
      }));
    } finally {
      setLessonLoadingId(null);
    }
  }

  function toggleLesson(lessonId: string) {
    if (expandedLessonId === lessonId) {
      setExpandedLessonId(null);
      return;
    }
    setExpandedLessonId(lessonId);
    if (!lessonContent[lessonId]) {
      loadLessonContent(lessonId);
    }
  }

  async function handleCompleteLesson(lessonId: string) {
    setCompletingLessonId(lessonId);
    try {
      await api.post(`/lessons/${lessonId}/complete`);
      setCompletedLessonIds((prev) => new Set(prev).add(lessonId));
    } catch {
      setLessonError((prev) => ({
        ...prev,
        [lessonId]: 'Could not mark this lesson complete. Please try again.',
      }));
    } finally {
      setCompletingLessonId(null);
    }
  }

  return (
    <AppShell>
      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      )}

      {!isLoading && error && <ErrorState message={error} onRetry={load} />}

      {!isLoading && !error && course && (
        <div className="space-y-6">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900">{course.title}</h1>
              <Badge tone="brand">{course.subject.name}</Badge>
              {isEnrolled && <Badge tone="success">Enrolled</Badge>}
            </div>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">{course.description}</p>
            <p className="mt-1 text-xs text-slate-500">
              Instructor: {course.instructor.firstName} {course.instructor.lastName}
            </p>
          </div>

          {canEnroll && (
            <div className="flex flex-col items-start gap-2">
              <Button onClick={handleEnroll} isLoading={isEnrolling}>
                Enroll in this course
              </Button>
              {enrollError && (
                <p role="alert" className="text-sm text-red-600">
                  {enrollError}
                </p>
              )}
            </div>
          )}

          {canViewContent ? (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-900">Course content</h2>
              {course.modules.length === 0 && (
                <EmptyState
                  title="No modules yet"
                  description="This course doesn't have any content published yet."
                />
              )}
              {course.modules
                .slice()
                .sort((a, b) => a.order - b.order)
                .map((module) => (
                  <Card key={module.id}>
                    <CardTitle>{module.title}</CardTitle>
                    <ul className="mt-3 divide-y divide-slate-100">
                      {module.lessons
                        .slice()
                        .sort((a, b) => a.order - b.order)
                        .map((lesson) => {
                          const isExpanded = expandedLessonId === lesson.id;
                          const isDone = completedLessonIds.has(lesson.id);
                          return (
                            <li key={lesson.id} className="py-3">
                              <button
                                type="button"
                                onClick={() => toggleLesson(lesson.id)}
                                aria-expanded={isExpanded}
                                className="focus-ring flex w-full items-center justify-between gap-2 rounded-md py-1 text-left"
                              >
                                <span className="text-sm font-medium text-slate-800">{lesson.title}</span>
                                <span className="flex items-center gap-2 text-xs text-slate-500">
                                  {lesson.estimatedMinutes != null && <span>{lesson.estimatedMinutes} min</span>}
                                  {isDone && <Badge tone="success">Completed</Badge>}
                                  <span aria-hidden="true">{isExpanded ? '▲' : '▼'}</span>
                                </span>
                              </button>
                              {isExpanded && (
                                <div className="mt-3 rounded-md bg-slate-50 p-4">
                                  {lessonLoadingId === lesson.id && <Skeleton className="h-16 w-full" />}
                                  {lessonError[lesson.id] && (
                                    <ErrorState
                                      message={lessonError[lesson.id]}
                                      onRetry={() => loadLessonContent(lesson.id)}
                                    />
                                  )}
                                  {lessonContent[lesson.id] && (
                                    <div className="space-y-3">
                                      <p className="whitespace-pre-wrap text-sm text-slate-700">
                                        {lessonContent[lesson.id].content}
                                      </p>
                                      <Button
                                        size="sm"
                                        variant={isDone ? 'secondary' : 'primary'}
                                        disabled={isDone}
                                        isLoading={completingLessonId === lesson.id}
                                        onClick={() => handleCompleteLesson(lesson.id)}
                                      >
                                        {isDone ? 'Completed' : 'Mark complete'}
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </li>
                          );
                        })}
                    </ul>
                  </Card>
                ))}
            </div>
          ) : (
            <EmptyState
              title="Enroll to see course content"
              description="Modules and lessons unlock once you're enrolled in this course."
            />
          )}
        </div>
      )}
    </AppShell>
  );
}
