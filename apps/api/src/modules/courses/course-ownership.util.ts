import { ForbiddenException } from '@nestjs/common';
import { Role } from '@learnai/shared';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

/**
 * Shared write-permission check for Course and everything nested under it
 * (Module, Lesson) as well as the enrollment roster. Throws unless the
 * caller is an ADMIN or the instructor who owns the course.
 */
export function assertInstructorOwnsCourse(course: { instructorId: string }, user: AuthenticatedUser): void {
  if (user.role !== Role.ADMIN && course.instructorId !== user.userId) {
    throw new ForbiddenException('You do not have permission to modify this course');
  }
}
