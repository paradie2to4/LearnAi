'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ProgressSummaryDto } from '@learnai/shared';
import { api, ApiError } from '../../lib/api-client';
import { AppShell } from '../../components/app-shell';
import { Card, CardDescription, CardTitle } from '../../components/ui/card';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/states';
import { TopicMasteryChart } from '../../components/topic-mastery-chart';

export default function ProgressPage() {
  const [data, setData] = useState<ProgressSummaryDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setIsLoading(true);
    setError(null);
    api
      .get<ProgressSummaryDto>('/progress/me')
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load your progress.'))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <AppShell>
      <h1 className="text-2xl font-bold text-slate-900">Your progress</h1>
      <p className="mt-1 text-sm text-slate-500">Track your mastery, streaks, and course completion.</p>

      <div className="mt-6">
        {isLoading && (
          <div className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}

        {!isLoading && error && <ErrorState message={error} onRetry={load} />}

        {!isLoading && !error && data && (
          <div className="space-y-8">
            <Card className="flex flex-wrap items-center gap-8">
              <div className="flex items-center gap-3">
                <span className="text-4xl" aria-hidden="true">
                  🔥
                </span>
                <div>
                  <p className="text-2xl font-bold text-slate-900">{data.currentStreakDays}</p>
                  <p className="text-sm text-slate-500">day current streak</p>
                </div>
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{data.longestStreakDays}</p>
                <p className="text-sm text-slate-500">longest streak (days)</p>
              </div>
            </Card>

            {data.topics.length === 0 && data.courses.length === 0 ? (
              <EmptyState
                title="No progress yet"
                description="Start a lesson or take a quiz to begin tracking your mastery."
              />
            ) : (
              <>
                <section aria-labelledby="topic-mastery-heading">
                  <h2 id="topic-mastery-heading" className="mb-3 text-lg font-semibold text-slate-900">
                    Topic mastery
                  </h2>
                  {data.topics.length === 0 ? (
                    <EmptyState
                      title="No topic data yet"
                      description="Take a few quizzes to see your mastery broken down by topic."
                    />
                  ) : (
                    <Card>
                      <TopicMasteryChart topics={data.topics} />
                    </Card>
                  )}
                </section>

                <section aria-labelledby="course-progress-heading">
                  <h2 id="course-progress-heading" className="mb-3 text-lg font-semibold text-slate-900">
                    Course completion
                  </h2>
                  {data.courses.length === 0 ? (
                    <EmptyState
                      title="No courses in progress"
                      description="Enroll in a course to start tracking your completion."
                    />
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2">
                      {data.courses.map((course) => {
                        const clamped = Math.min(100, Math.max(0, course.completionPercent));
                        return (
                          <Card key={course.courseId}>
                            {/* CourseProgressDto has no title field, so we label by id. */}
                            <CardTitle>Course {course.courseId.slice(0, 8)}</CardTitle>
                            <CardDescription>
                              {course.lessonsCompleted} of {course.totalLessons} lessons completed
                            </CardDescription>
                            <div
                              role="progressbar"
                              aria-valuenow={Math.round(clamped)}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-label="Course completion"
                              className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-100"
                            >
                              <div className="h-full rounded-full bg-brand-600" style={{ width: `${clamped}%` }} />
                            </div>
                            <p className="mt-2 text-xs text-slate-500">
                              {Math.round(clamped)}% complete · {course.currentStreakDays} day streak
                            </p>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
