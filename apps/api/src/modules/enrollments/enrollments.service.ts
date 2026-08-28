import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EnrollmentStatus } from '@learnai/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { assertInstructorOwnsCourse } from '../courses/course-ownership.util';
import { CourseForSummary, courseSummaryInclude, toCourseSummaryDto } from '../courses/course-mapper.util';

@Injectable()
export class EnrollmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async enroll(courseId: string, user: AuthenticatedUser) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) {
      throw new NotFoundException('Course not found');
    }
    if (!course.isPublished) {
      throw new BadRequestException('Cannot enroll in an unpublished course');
    }

    const existing = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: user.userId, courseId } },
      include: { course: { include: courseSummaryInclude } },
    });
    if (existing) {
      return this.toDto(existing);
    }

    try {
      const created = await this.prisma.enrollment.create({
        data: { userId: user.userId, courseId },
        include: { course: { include: courseSummaryInclude } },
      });
      return this.toDto(created);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const fallback = await this.prisma.enrollment.findUnique({
          where: { userId_courseId: { userId: user.userId, courseId } },
          include: { course: { include: courseSummaryInclude } },
        });
        if (fallback) {
          return this.toDto(fallback);
        }
      }
      throw err;
    }
  }

  async drop(id: string, user: AuthenticatedUser): Promise<void> {
    const enrollment = await this.prisma.enrollment.findUnique({ where: { id } });
    if (!enrollment) {
      throw new NotFoundException('Enrollment not found');
    }
    if (enrollment.userId !== user.userId) {
      throw new ForbiddenException('You do not have permission to modify this enrollment');
    }
    if (enrollment.status === EnrollmentStatus.DROPPED) {
      return;
    }
    await this.prisma.enrollment.update({
      where: { id },
      data: { status: EnrollmentStatus.DROPPED },
    });
  }

  async findMine(user: AuthenticatedUser) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId: user.userId },
      include: { course: { include: courseSummaryInclude } },
      orderBy: { enrolledAt: 'desc' },
    });
    return enrollments.map((enrollment) => this.toDto(enrollment));
  }

  async getRoster(courseId: string, user: AuthenticatedUser) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) {
      throw new NotFoundException('Course not found');
    }
    assertInstructorOwnsCourse(course, user);

    const enrollments = await this.prisma.enrollment.findMany({
      where: { courseId },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      orderBy: { enrolledAt: 'asc' },
    });

    return enrollments.map((enrollment) => ({
      id: enrollment.id,
      status: enrollment.status,
      enrolledAt: enrollment.enrolledAt.toISOString(),
      completedAt: enrollment.completedAt ? enrollment.completedAt.toISOString() : null,
      student: enrollment.user,
    }));
  }

  /**
   * Plain in-process method (not an HTTP endpoint). Intended to be called by
   * the progress module once a student's CourseProgress.completionPercent hits 100%.
   */
  async markCompleted(userId: string, courseId: string): Promise<void> {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    if (!enrollment || enrollment.status === EnrollmentStatus.COMPLETED) {
      return;
    }
    await this.prisma.enrollment.update({
      where: { id: enrollment.id },
      data: { status: EnrollmentStatus.COMPLETED, completedAt: new Date() },
    });
  }

  private toDto(enrollment: {
    id: string;
    courseId: string;
    status: string;
    enrolledAt: Date;
    completedAt: Date | null;
    course: CourseForSummary;
  }) {
    return {
      id: enrollment.id,
      courseId: enrollment.courseId,
      status: enrollment.status,
      enrolledAt: enrollment.enrolledAt.toISOString(),
      completedAt: enrollment.completedAt ? enrollment.completedAt.toISOString() : null,
      course: toCourseSummaryDto(enrollment.course),
    };
  }
}
