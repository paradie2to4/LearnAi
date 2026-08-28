'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { CourseSummaryDto } from '@learnai/shared';
import { Card, CardTitle, CardDescription } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { api, ApiError } from '../lib/api-client';

interface CourseCardProps {
  course: CourseSummaryDto;
  isEnrolled: boolean;
  /** Whether the current user is allowed to enroll (i.e. is a STUDENT and not already enrolled). */
  canEnroll: boolean;
  onEnrolled?: (courseId: string) => void;
}

export function CourseCard({ course, isEnrolled, canEnroll, onEnrolled }: CourseCardProps) {
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleEnroll() {
    setError(null);
    setIsEnrolling(true);
    try {
      await api.post(`/courses/${course.id}/enroll`);
      onEnrolled?.(course.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not enroll. Please try again.');
    } finally {
      setIsEnrolling(false);
    }
  }

  return (
    <Card className="flex h-full flex-col justify-between gap-4">
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle>{course.title}</CardTitle>
          <Badge tone="brand">{course.subject.name}</Badge>
        </div>
        <CardDescription className="line-clamp-3">{course.description}</CardDescription>
        <p className="text-xs text-slate-500">
          Instructor: {course.instructor.firstName} {course.instructor.lastName}
        </p>
        {isEnrolled && <Badge tone="success">Enrolled</Badge>}
      </div>

      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        {isEnrolled || !canEnroll ? (
          <Link
            href={`/courses/${course.id}`}
            className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg border border-brand-300 bg-white px-3 py-1.5 text-sm font-medium text-brand-700 transition hover:bg-brand-50"
          >
            View course
          </Link>
        ) : (
          <Button variant="primary" size="sm" isLoading={isEnrolling} onClick={handleEnroll}>
            Enroll
          </Button>
        )}
      </div>
    </Card>
  );
}
