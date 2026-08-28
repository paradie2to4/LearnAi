import { Controller, ForbiddenException, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@learnai/shared';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { ProgressService } from './progress.service';

/**
 * Read-only surface for the progress module. All writes come from event
 * consumers (see progress.consumer.ts) or the manual ProgressService.recalculateForUser.
 */
@ApiTags('progress')
@ApiBearerAuth()
@Controller('progress')
export class ProgressController {
  constructor(
    private readonly progressService: ProgressService,
    private readonly prisma: PrismaService,
  ) {}

  @Roles(Role.STUDENT)
  @Get('me')
  getMySummary(@CurrentUser() user: AuthenticatedUser) {
    return this.progressService.getSummaryForUser(user.userId);
  }

  /**
   * Returns CourseProgress for a given course. Defaults to the caller's own
   * row; a STUDENT may only ever see their own. An INSTRUCTOR (of that
   * course) or ADMIN may pass `?userId=<studentId>` to inspect a specific
   * student's progress in their course.
   */
  @Get('courses/:id')
  async getCourseProgress(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') courseId: string,
    @Query('userId') queryUserId?: string,
  ) {
    const targetUserId = queryUserId ?? user.userId;

    if (targetUserId !== user.userId) {
      if (user.role === Role.ADMIN) {
        // allowed
      } else if (user.role === Role.INSTRUCTOR) {
        const course = await this.prisma.course.findUnique({
          where: { id: courseId },
          select: { instructorId: true },
        });
        if (!course) {
          throw new NotFoundException('Course not found');
        }
        if (course.instructorId !== user.userId) {
          throw new ForbiddenException('You are not the instructor of this course');
        }
      } else {
        throw new ForbiddenException('You may only view your own course progress');
      }
    }

    return this.progressService.getCourseProgress(targetUserId, courseId);
  }

  @Roles(Role.STUDENT)
  @Get('topics/:topicId')
  getTopicProgress(@CurrentUser() user: AuthenticatedUser, @Param('topicId') topicId: string) {
    return this.progressService.getTopicProgress(user.userId, topicId);
  }
}
