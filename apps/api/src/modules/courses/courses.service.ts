import { Injectable, NotFoundException } from '@nestjs/common';
import { ActivityType, Role } from '@learnai/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { assertInstructorOwnsCourse } from './course-ownership.util';
import { courseSummaryInclude, toCourseSummaryDto } from './course-mapper.util';

@Injectable()
export class CoursesService {
  constructor(private readonly prisma: PrismaService) {}

  async findPublished(subjectId?: string) {
    const courses = await this.prisma.course.findMany({
      where: {
        isPublished: true,
        isArchived: false,
        ...(subjectId ? { subjectId } : {}),
      },
      include: courseSummaryInclude,
      orderBy: { createdAt: 'desc' },
    });
    return courses.map((course) => toCourseSummaryDto(course));
  }

  /** An instructor's own courses regardless of publish state (for their authoring dashboard). ADMIN sees all. */
  async findMine(user: AuthenticatedUser) {
    const courses = await this.prisma.course.findMany({
      where: user.role === Role.ADMIN ? {} : { instructorId: user.userId },
      include: courseSummaryInclude,
      orderBy: { createdAt: 'desc' },
    });
    return courses.map((course) => toCourseSummaryDto(course));
  }

  async findOneDetail(id: string, user: AuthenticatedUser) {
    const course = await this.prisma.course.findUnique({
      where: { id },
      include: {
        ...courseSummaryInclude,
        modules: {
          orderBy: { order: 'asc' },
          include: { lessons: { orderBy: { order: 'asc' } } },
        },
      },
    });
    if (!course) {
      throw new NotFoundException('Course not found');
    }

    const isOwnerOrAdmin = user.role === Role.ADMIN || course.instructorId === user.userId;
    if (!course.isPublished && !isOwnerOrAdmin) {
      throw new NotFoundException('Course not found');
    }

    const completedLessonIds = await this.getCompletedLessonIds(course, user);

    return {
      ...toCourseSummaryDto(course),
      modules: course.modules.map((courseModule) => ({
        id: courseModule.id,
        title: courseModule.title,
        order: courseModule.order,
        lessons: courseModule.lessons.map((lesson) => ({
          id: lesson.id,
          title: lesson.title,
          order: lesson.order,
          estimatedMinutes: lesson.estimatedMinutes,
          topicId: lesson.topicId,
          ...(user.role === Role.STUDENT ? { completed: completedLessonIds.has(lesson.id) } : {}),
        })),
      })),
    };
  }

  async create(dto: CreateCourseDto, user: AuthenticatedUser) {
    const instructorId = user.role === Role.ADMIN && dto.instructorId ? dto.instructorId : user.userId;
    const course = await this.prisma.course.create({
      data: {
        title: dto.title,
        description: dto.description,
        subjectId: dto.subjectId,
        instructorId,
      },
      include: courseSummaryInclude,
    });
    return toCourseSummaryDto(course);
  }

  async update(id: string, dto: UpdateCourseDto, user: AuthenticatedUser) {
    const course = await this.getCourseOrThrow(id);
    assertInstructorOwnsCourse(course, user);

    const updated = await this.prisma.course.update({
      where: { id },
      data: dto,
      include: courseSummaryInclude,
    });
    return toCourseSummaryDto(updated);
  }

  async publish(id: string, user: AuthenticatedUser) {
    const course = await this.getCourseOrThrow(id);
    assertInstructorOwnsCourse(course, user);

    const updated = await this.prisma.course.update({
      where: { id },
      data: { isPublished: true },
      include: courseSummaryInclude,
    });
    return toCourseSummaryDto(updated);
  }

  private async getCourseOrThrow(id: string) {
    const course = await this.prisma.course.findUnique({ where: { id } });
    if (!course) {
      throw new NotFoundException('Course not found');
    }
    return course;
  }

  private async getCompletedLessonIds(
    course: { id: string; modules: { lessons: { id: string }[] }[] },
    user: AuthenticatedUser,
  ): Promise<Set<string>> {
    if (user.role !== Role.STUDENT) {
      return new Set();
    }
    const lessonIds = course.modules.flatMap((courseModule) =>
      courseModule.lessons.map((lesson) => lesson.id),
    );
    if (lessonIds.length === 0) {
      return new Set();
    }
    const completed = await this.prisma.activityEvent.findMany({
      where: {
        userId: user.userId,
        type: ActivityType.LESSON_COMPLETED,
        lessonId: { in: lessonIds },
      },
      select: { lessonId: true },
    });
    return new Set(
      completed.map((event) => event.lessonId).filter((lessonId): lessonId is string => !!lessonId),
    );
  }
}
