'use client';

import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import type { CourseSummaryDto, EnrollmentDto } from '@learnai/shared';
import { EnrollmentStatus } from '@learnai/shared';
import { useAuth } from '../../lib/auth-context';
import { api, ApiError } from '../../lib/api-client';
import { AppShell } from '../../components/app-shell';
import { CourseCard } from '../../components/course-card';
import { Skeleton, EmptyState, ErrorState } from '../../components/ui/states';

export default function CoursesPage() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<CourseSummaryDto[] | null>(null);
  const [enrollments, setEnrollments] = useState<EnrollmentDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<string>('all');

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const coursesResult = await api.get<CourseSummaryDto[]>('/courses');
      setCourses(coursesResult);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load courses.');
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
  }, []);

  const enrolledCourseIds = useMemo(() => new Set(enrollments.map((e) => e.courseId)), [enrollments]);

  const subjects = useMemo(() => {
    if (!courses) return [];
    const map = new Map<string, string>();
    courses.forEach((c) => map.set(c.subject.id, c.subject.name));
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [courses]);

  const filteredCourses = useMemo(() => {
    if (!courses) return [];
    if (selectedSubject === 'all') return courses;
    return courses.filter((c) => c.subject.id === selectedSubject);
  }, [courses, selectedSubject]);

  function handleEnrolled(courseId: string) {
    setEnrollments((prev) => {
      if (prev.some((e) => e.courseId === courseId)) return prev;
      const course = courses?.find((c) => c.id === courseId);
      if (!course) return prev;
      return [
        ...prev,
        {
          id: `local-${courseId}`,
          courseId,
          status: EnrollmentStatus.ACTIVE,
          enrolledAt: new Date().toISOString(),
          completedAt: null,
          course,
        },
      ];
    });
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Courses</h1>
          <p className="text-sm text-slate-500">Browse available courses and continue your learning.</p>
        </div>

        {isLoading && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-48 w-full" />
            ))}
          </div>
        )}

        {!isLoading && error && <ErrorState message={error} onRetry={load} />}

        {!isLoading && !error && courses && courses.length === 0 && (
          <EmptyState title="No courses available" description="Check back soon for new courses." />
        )}

        {!isLoading && !error && courses && courses.length > 0 && (
          <>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by subject">
              <button
                type="button"
                onClick={() => setSelectedSubject('all')}
                aria-pressed={selectedSubject === 'all'}
                className={clsx(
                  'focus-ring rounded-full px-3 py-1.5 text-sm font-medium',
                  selectedSubject === 'all' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
                )}
              >
                All subjects
              </button>
              {subjects.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedSubject(s.id)}
                  aria-pressed={selectedSubject === s.id}
                  className={clsx(
                    'focus-ring rounded-full px-3 py-1.5 text-sm font-medium',
                    selectedSubject === s.id ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
                  )}
                >
                  {s.name}
                </button>
              ))}
            </div>

            {filteredCourses.length === 0 ? (
              <EmptyState title="No courses match this filter" />
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredCourses.map((course) => (
                  <CourseCard
                    key={course.id}
                    course={course}
                    isEnrolled={enrolledCourseIds.has(course.id)}
                    canEnroll={user?.role === 'STUDENT'}
                    onEnrolled={handleEnrolled}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
