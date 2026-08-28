export interface CourseForSummary {
  id: string;
  title: string;
  description: string;
  isPublished: boolean;
  subject: { id: string; name: string; description: string | null };
  instructor: { id: string; firstName: string; lastName: string };
  _count?: { enrollments: number };
}

export function toCourseSummaryDto(course: CourseForSummary) {
  return {
    id: course.id,
    title: course.title,
    description: course.description,
    subject: course.subject,
    instructor: course.instructor,
    isPublished: course.isPublished,
    ...(course._count ? { enrollmentCount: course._count.enrollments } : {}),
  };
}

export const courseSummaryInclude = {
  subject: true,
  instructor: { select: { id: true, firstName: true, lastName: true } },
  _count: { select: { enrollments: true } },
} as const;
