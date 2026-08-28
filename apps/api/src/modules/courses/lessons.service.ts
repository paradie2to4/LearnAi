import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { ActivityType, EVENT_EXCHANGE, LessonCompletedEvent, Role, RoutingKeys } from '@learnai/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';
import { assertInstructorOwnsCourse } from './course-ownership.util';
import { ModulesService } from './modules.service';

@Injectable()
export class LessonsService {
  private readonly logger = new Logger(LessonsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly modulesService: ModulesService,
    private readonly amqpConnection: AmqpConnection,
  ) {}

  async create(moduleId: string, dto: CreateLessonDto, user: AuthenticatedUser) {
    const courseModule = await this.modulesService.getModuleWithCourseOrThrow(moduleId);
    assertInstructorOwnsCourse(courseModule.course, user);

    return this.withOrderConflictHandling(() =>
      this.prisma.lesson.create({
        data: {
          moduleId,
          title: dto.title,
          content: dto.content,
          order: dto.order,
          topicId: dto.topicId,
          estimatedMinutes: dto.estimatedMinutes,
        },
      }),
    );
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const lesson = await this.getLessonWithCourseOrThrow(id);
    const isOwnerOrAdmin = user.role === Role.ADMIN || lesson.module.course.instructorId === user.userId;
    if (!lesson.module.course.isPublished && !isOwnerOrAdmin) {
      throw new NotFoundException('Lesson not found');
    }
    return this.toDto(lesson);
  }

  async update(id: string, dto: UpdateLessonDto, user: AuthenticatedUser) {
    const lesson = await this.getLessonWithCourseOrThrow(id);
    assertInstructorOwnsCourse(lesson.module.course, user);

    const updated = await this.withOrderConflictHandling(() =>
      this.prisma.lesson.update({ where: { id }, data: dto }),
    );
    return this.toDto(updated);
  }

  async complete(
    lessonId: string,
    user: AuthenticatedUser,
  ): Promise<{ completed: true; alreadyCompleted: boolean }> {
    const lesson = await this.getLessonWithCourseOrThrow(lessonId);

    const existing = await this.prisma.activityEvent.findFirst({
      where: { userId: user.userId, lessonId, type: ActivityType.LESSON_COMPLETED },
    });
    if (existing) {
      return { completed: true, alreadyCompleted: true };
    }

    await this.prisma.activityEvent.create({
      data: {
        userId: user.userId,
        courseId: lesson.module.courseId,
        lessonId,
        type: ActivityType.LESSON_COMPLETED,
      },
    });

    const payload: LessonCompletedEvent = {
      userId: user.userId,
      courseId: lesson.module.courseId,
      lessonId,
      occurredAt: new Date().toISOString(),
    };

    try {
      await this.amqpConnection.publish(EVENT_EXCHANGE, RoutingKeys.LESSON_COMPLETED, payload);
    } catch (err) {
      this.logger.error('Failed to publish LessonCompleted event', err instanceof Error ? err.stack : err);
    }

    return { completed: true, alreadyCompleted: false };
  }

  private async getLessonWithCourseOrThrow(id: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id },
      include: { module: { include: { course: true } } },
    });
    if (!lesson) {
      throw new NotFoundException('Lesson not found');
    }
    return lesson;
  }

  private toDto(lesson: {
    id: string;
    title: string;
    content: string;
    order: number;
    topicId: string | null;
    estimatedMinutes: number | null;
    moduleId: string;
  }) {
    return {
      id: lesson.id,
      title: lesson.title,
      order: lesson.order,
      estimatedMinutes: lesson.estimatedMinutes,
      topicId: lesson.topicId,
      content: lesson.content,
      moduleId: lesson.moduleId,
    };
  }

  private async withOrderConflictHandling<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('A lesson with this order already exists in the module');
      }
      throw err;
    }
  }
}
