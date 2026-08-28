import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '@learnai/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

/**
 * Resolves the instructorId of the Course that owns a quiz, given either a
 * direct courseId or a lessonId (traversed lesson -> module -> course).
 *
 * Used both when creating a quiz (from the incoming DTO, which has no Quiz
 * row yet) and when mutating an existing quiz/question (from the persisted
 * Quiz's courseId/lessonId). Deliberately queries Prisma directly instead of
 * importing anything from the courses module, per module-boundary rules.
 */
export async function resolveOwningInstructorId(
  prisma: PrismaService,
  target: { courseId?: string | null; lessonId?: string | null },
): Promise<string> {
  if (target.courseId) {
    const course = await prisma.course.findUnique({ where: { id: target.courseId } });
    if (!course) {
      throw new NotFoundException('Course not found');
    }
    return course.instructorId;
  }

  if (target.lessonId) {
    const lesson = await prisma.lesson.findUnique({
      where: { id: target.lessonId },
      include: { module: { include: { course: true } } },
    });
    if (!lesson) {
      throw new NotFoundException('Lesson not found');
    }
    return lesson.module.course.instructorId;
  }

  throw new NotFoundException('Quiz is not attached to a course or lesson');
}

/** Throws ForbiddenException unless the caller owns the resource or is an ADMIN. */
export function assertIsOwnerOrAdmin(instructorId: string, user: AuthenticatedUser): void {
  if (user.role !== Role.ADMIN && user.userId !== instructorId) {
    throw new ForbiddenException('You do not have permission to manage this resource');
  }
}
