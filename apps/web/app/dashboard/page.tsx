'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type {
  AiDraftQuestionDto,
  CourseSummaryDto,
  EnrollmentDto,
  NotificationDto,
  ProgressSummaryDto,
  RecommendationDto,
} from '@learnai/shared';
import { EnrollmentStatus, Role } from '@learnai/shared';
import { useAuth } from '../../lib/auth-context';
import { api, ApiError } from '../../lib/api-client';
import { AppShell } from '../../components/app-shell';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardTitle, CardDescription } from '../../components/ui/card';
import { Skeleton, EmptyState, ErrorState } from '../../components/ui/states';

interface SectionState<T> {
  data: T | null;
  error: string | null;
}

function describeError(reason: unknown): string {
  if (reason instanceof ApiError) return reason.message;
  return 'Something went wrong loading this data.';
}

export default function DashboardPage() {
  const { user, isLoading: authLoading } = useAuth();

  if (authLoading || !user) {
    return (
      <AppShell>
        <div className="space-y-6">
          <Skeleton className="h-10 w-1/3" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-40 w-full" />
            ))}
          </div>
        </div>
      </AppShell>
    );
  }

  // Progress/recommendations are student-specific concepts — an instructor or admin
  // has no personal mastery/weak-topic data, so the backend correctly rejects those
  // endpoints for non-students (403). Each role gets a dashboard built around what
  // that role actually does: students learn/practice/self-assess, instructors manage
  // their own courses, admins oversee the whole platform.
  if (user.role === Role.ADMIN) {
    return <AdminDashboard firstName={user.firstName} />;
  }
  if (user.role === Role.INSTRUCTOR) {
    return <InstructorDashboard firstName={user.firstName} userId={user.id} />;
  }

  return <StudentDashboard firstName={user.firstName} />;
}

function StatCard({ label, value, isLoading }: { label: string; value: string | number; isLoading: boolean }) {
  return (
    <Card>
      <p className="text-sm text-slate-500">{label}</p>
      {isLoading ? (
        <Skeleton className="mt-2 h-7 w-12" />
      ) : (
        <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
      )}
    </Card>
  );
}

function NotificationsPanel() {
  const [notifications, setNotifications] = useState<SectionState<NotificationDto[]>>({ data: null, error: null });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    api
      .get<NotificationDto[]>('/notifications/me?unread=true')
      .then((data) => setNotifications({ data, error: null }))
      .catch((err) => setNotifications({ data: null, error: describeError(err) }))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <section aria-labelledby="notifications-heading" className="space-y-3">
      <h2 id="notifications-heading" className="text-lg font-semibold text-slate-900">
        Unread notifications
      </h2>
      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : notifications.error ? (
        <ErrorState message={notifications.error} />
      ) : !notifications.data || notifications.data.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-500">You&apos;re all caught up.</p>
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {notifications.data.slice(0, 5).map((n) => (
              <li key={n.id} className="py-2">
                <p className="text-sm font-medium text-slate-800">{n.title}</p>
                <p className="text-xs text-slate-500">{n.body}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}

function InstructorDashboard({ firstName, userId }: { firstName: string; userId: string }) {
  const [courses, setCourses] = useState<CourseSummaryDto[] | null>(null);
  const [drafts, setDrafts] = useState<AiDraftQuestionDto[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([
      api.get<CourseSummaryDto[]>('/courses?instructorId=me'),
      api.get<AiDraftQuestionDto[]>('/ai/drafts?status=PENDING'),
    ]).then(([coursesResult, draftsResult]) => {
      setCourses(
        coursesResult.status === 'fulfilled' ? coursesResult.value.filter((c) => c.instructor.id === userId) : [],
      );
      setDrafts(draftsResult.status === 'fulfilled' ? draftsResult.value : []);
      setIsLoading(false);
    });
  }, [userId]);

  const publishedCount = (courses ?? []).filter((c) => c.isPublished).length;
  const totalEnrollments = (courses ?? []).reduce((sum, c) => sum + (c.enrollmentCount ?? 0), 0);

  return (
    <AppShell>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Welcome back, {firstName}</h1>
          <p className="text-sm text-slate-500">Your courses, your students, your AI review queue.</p>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Your courses" value={courses?.length ?? 0} isLoading={isLoading} />
          <StatCard label="Published" value={publishedCount} isLoading={isLoading} />
          <StatCard label="Total enrollments" value={totalEnrollments} isLoading={isLoading} />
          <StatCard label="Pending AI drafts" value={drafts?.length ?? 0} isLoading={isLoading} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card interactive>
            <CardTitle>Manage courses &amp; quizzes</CardTitle>
            <CardDescription>Create courses, author quizzes, and generate AI question drafts.</CardDescription>
            <Link href="/instructor" className="mt-4 inline-block">
              <Button size="sm">Go to Instructor tools</Button>
            </Link>
          </Card>
          <Card interactive>
            <CardTitle>Review AI drafts</CardTitle>
            <CardDescription>
              {drafts && drafts.length > 0
                ? `${drafts.length} question${drafts.length === 1 ? '' : 's'} awaiting your review.`
                : 'Nothing pending right now.'}
            </CardDescription>
            <Link href="/instructor#drafts" className="mt-4 inline-block">
              <Button size="sm" variant="secondary">
                Review drafts
              </Button>
            </Link>
          </Card>
        </div>

        <NotificationsPanel />
      </div>
    </AppShell>
  );
}

function AdminDashboard({ firstName }: { firstName: string }) {
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Record<string, unknown>>('/analytics/platform')
      .then(setStats)
      .catch((err) => setError(describeError(err)))
      .finally(() => setIsLoading(false));
  }, []);

  const statEntries = stats
    ? Object.entries(stats).filter(([, v]) => typeof v === 'number' || typeof v === 'string').slice(0, 4)
    : [];

  return (
    <AppShell>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Welcome back, {firstName}</h1>
          <p className="text-sm text-slate-500">Platform-wide oversight: users, courses, and taxonomy.</p>
        </div>

        {error ? (
          <ErrorState message={error} />
        ) : (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {isLoading ? (
              <>
                <StatCard label="Loading…" value="" isLoading />
                <StatCard label="Loading…" value="" isLoading />
                <StatCard label="Loading…" value="" isLoading />
                <StatCard label="Loading…" value="" isLoading />
              </>
            ) : (
              statEntries.map(([key, value]) => (
                <StatCard
                  key={key}
                  label={key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase())}
                  value={typeof value === 'number' ? value.toLocaleString() : String(value)}
                  isLoading={false}
                />
              ))
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Card interactive>
            <CardTitle>Users &amp; roles</CardTitle>
            <CardDescription>Promote/demote roles and see everyone on the platform.</CardDescription>
            <Link href="/admin" className="mt-4 inline-block">
              <Button size="sm">Go to Admin tools</Button>
            </Link>
          </Card>
          <Card interactive>
            <CardTitle>Instructor tools</CardTitle>
            <CardDescription>Admins can also create and manage courses directly.</CardDescription>
            <Link href="/instructor" className="mt-4 inline-block">
              <Button size="sm" variant="secondary">
                Go to Instructor tools
              </Button>
            </Link>
          </Card>
        </div>

        <NotificationsPanel />
      </div>
    </AppShell>
  );
}

function StudentDashboard({ firstName }: { firstName: string }) {
  const [isLoading, setIsLoading] = useState(true);
  const [enrollments, setEnrollments] = useState<SectionState<EnrollmentDto[]>>({ data: null, error: null });
  const [progress, setProgress] = useState<SectionState<ProgressSummaryDto>>({ data: null, error: null });
  const [notifications, setNotifications] = useState<SectionState<NotificationDto[]>>({ data: null, error: null });
  const [recommendations, setRecommendations] = useState<SectionState<RecommendationDto[]>>({
    data: null,
    error: null,
  });

  async function loadAll() {
    setIsLoading(true);
    const [enrollmentsResult, progressResult, notificationsResult, recommendationsResult] = await Promise.allSettled([
      api.get<EnrollmentDto[]>('/enrollments/me'),
      api.get<ProgressSummaryDto>('/progress/me'),
      api.get<NotificationDto[]>('/notifications/me?unread=true'),
      api.get<RecommendationDto[]>('/recommendations/me'),
    ]);

    setEnrollments(
      enrollmentsResult.status === 'fulfilled'
        ? { data: enrollmentsResult.value, error: null }
        : { data: null, error: describeError(enrollmentsResult.reason) },
    );
    setProgress(
      progressResult.status === 'fulfilled'
        ? { data: progressResult.value, error: null }
        : { data: null, error: describeError(progressResult.reason) },
    );
    setNotifications(
      notificationsResult.status === 'fulfilled'
        ? { data: notificationsResult.value, error: null }
        : { data: null, error: describeError(notificationsResult.reason) },
    );
    setRecommendations(
      recommendationsResult.status === 'fulfilled'
        ? { data: recommendationsResult.value, error: null }
        : { data: null, error: describeError(recommendationsResult.reason) },
    );

    setIsLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  const activeEnrollments = (enrollments.data ?? []).filter((e) => e.status === EnrollmentStatus.ACTIVE);
  const courseProgressById = new Map((progress.data?.courses ?? []).map((c) => [c.courseId, c]));

  const weakTopics = (progress.data?.topics ?? [])
    .filter((t) => t.masteryScore < 70)
    .sort((a, b) => a.masteryScore - b.masteryScore);

  const topRecommendations = (recommendations.data ?? [])
    .slice()
    .sort((a, b) => (a.studyOrder ?? Infinity) - (b.studyOrder ?? Infinity))
    .slice(0, 3);

  if (isLoading) {
    return (
      <AppShell>
        <div className="space-y-6">
          <Skeleton className="h-10 w-1/3" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-40 w-full" />
            ))}
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Welcome back, {firstName}</h1>
            <p className="text-sm text-slate-500">Here&apos;s where you left off.</p>
          </div>
          {progress.data && (
            <div className="rounded-lg bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">
              🔥 {progress.data.currentStreakDays}-day streak
            </div>
          )}
        </div>

        <section aria-labelledby="continue-learning-heading" className="space-y-3">
          <h2 id="continue-learning-heading" className="text-lg font-semibold text-slate-900">
            Continue learning
          </h2>
          {enrollments.error ? (
            <ErrorState message={enrollments.error} onRetry={loadAll} />
          ) : activeEnrollments.length === 0 ? (
            <EmptyState
              title="No courses yet"
              description="Enroll in a course to start building your learning path."
              action={
                <Link
                  href="/courses"
                  className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-soft transition hover:bg-brand-700"
                >
                  Browse courses
                </Link>
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {activeEnrollments.map((enrollment) => {
                const courseProgress = courseProgressById.get(enrollment.courseId);
                const percent = courseProgress?.completionPercent ?? 0;
                return (
                  <Card key={enrollment.id} interactive>
                    <CardTitle>{enrollment.course.title}</CardTitle>
                    <CardDescription className="line-clamp-2">{enrollment.course.description}</CardDescription>
                    <div className="mt-3">
                      <div className="h-2 w-full rounded-full bg-slate-100">
                        <div
                          className="h-2 rounded-full bg-brand-600 transition-all duration-500"
                          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{Math.round(percent)}% complete</p>
                    </div>
                    <Link
                      href={`/courses/${enrollment.courseId}`}
                      className="focus-ring mt-3 inline-block rounded-md text-sm font-medium text-brand-600 hover:underline"
                    >
                      Continue →
                    </Link>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section aria-labelledby="weak-topics-heading" className="space-y-3">
            <h2 id="weak-topics-heading" className="text-lg font-semibold text-slate-900">
              Weak topics
            </h2>
            {progress.error ? (
              <ErrorState message={progress.error} onRetry={loadAll} />
            ) : weakTopics.length === 0 ? (
              <Card>
                <p className="text-sm text-slate-500">No weak topics detected right now. Keep it up!</p>
              </Card>
            ) : (
              <Card>
                <div className="flex flex-wrap gap-2">
                  {weakTopics.map((topic) => (
                    <Badge key={topic.topicId} tone="warning">
                      {topic.topicName} · {Math.round(topic.masteryScore)}%
                    </Badge>
                  ))}
                </div>
              </Card>
            )}
          </section>

          <section aria-labelledby="recommendations-heading" className="space-y-3">
            <h2 id="recommendations-heading" className="text-lg font-semibold text-slate-900">
              Recommended next
            </h2>
            {recommendations.error ? (
              <ErrorState message={recommendations.error} onRetry={loadAll} />
            ) : topRecommendations.length === 0 ? (
              <Card>
                <p className="text-sm text-slate-500">No recommendations yet.</p>
              </Card>
            ) : (
              <Card className="space-y-3">
                <ul className="space-y-2">
                  {topRecommendations.map((rec) => (
                    <li key={rec.id} className="text-sm text-slate-700">
                      {rec.narrative}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/recommendations"
                  className="focus-ring inline-block rounded-md text-sm font-medium text-brand-600 hover:underline"
                >
                  See all recommendations →
                </Link>
              </Card>
            )}
          </section>
        </div>

        {notifications.data && notifications.data.length > 0 && (
          <section aria-labelledby="notifications-heading" className="space-y-3">
            <h2 id="notifications-heading" className="text-lg font-semibold text-slate-900">
              Unread notifications
            </h2>
            <Card>
              <ul className="divide-y divide-slate-100">
                {notifications.data.slice(0, 5).map((n) => (
                  <li key={n.id} className="py-2">
                    <p className="text-sm font-medium text-slate-800">{n.title}</p>
                    <p className="text-xs text-slate-500">{n.body}</p>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        )}
        {notifications.error && <ErrorState message={notifications.error} onRetry={loadAll} />}
      </div>
    </AppShell>
  );
}
