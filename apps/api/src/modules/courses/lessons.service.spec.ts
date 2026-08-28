import { ForbiddenException } from '@nestjs/common';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { ActivityType, EVENT_EXCHANGE, Role, RoutingKeys } from '@learnai/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { LessonsService } from './lessons.service';
import { ModulesService } from './modules.service';

describe('LessonsService', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let modulesService: ModulesService;
  let amqpConnection: AmqpConnection;
  let service: LessonsService;

  const student: AuthenticatedUser = {
    userId: 'student-1',
    email: 'student@example.com',
    role: Role.STUDENT,
  };

  const lesson = {
    id: 'lesson-1',
    moduleId: 'module-1',
    title: 'Variables',
    content: 'Lesson content',
    order: 0,
    topicId: null,
    estimatedMinutes: 10,
    module: {
      id: 'module-1',
      courseId: 'course-1',
      course: { id: 'course-1', instructorId: 'instructor-1', isPublished: true },
    },
  };

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    modulesService = { getModuleWithCourseOrThrow: jest.fn() } as unknown as ModulesService;
    amqpConnection = { publish: jest.fn().mockResolvedValue(undefined) } as unknown as AmqpConnection;
    service = new LessonsService(prisma, modulesService, amqpConnection);
  });

  describe('complete', () => {
    it('creates an ActivityEvent and publishes LessonCompleted on first completion', async () => {
      prisma.lesson.findUnique.mockResolvedValue(lesson as any);
      prisma.activityEvent.findFirst.mockResolvedValue(null);
      prisma.activityEvent.create.mockResolvedValue({} as any);

      const result = await service.complete('lesson-1', student);

      expect(result).toEqual({ completed: true, alreadyCompleted: false });
      expect(prisma.activityEvent.create).toHaveBeenCalledWith({
        data: {
          userId: 'student-1',
          courseId: 'course-1',
          lessonId: 'lesson-1',
          type: ActivityType.LESSON_COMPLETED,
        },
      });
      expect(amqpConnection.publish).toHaveBeenCalledWith(
        EVENT_EXCHANGE,
        RoutingKeys.LESSON_COMPLETED,
        expect.objectContaining({ userId: 'student-1', courseId: 'course-1', lessonId: 'lesson-1' }),
      );
    });

    it('is idempotent: a second completion neither inserts another ActivityEvent nor republishes', async () => {
      prisma.lesson.findUnique.mockResolvedValue(lesson as any);
      prisma.activityEvent.findFirst.mockResolvedValue({ id: 'activity-1' } as any);

      const result = await service.complete('lesson-1', student);

      expect(result).toEqual({ completed: true, alreadyCompleted: true });
      expect(prisma.activityEvent.create).not.toHaveBeenCalled();
      expect(amqpConnection.publish).not.toHaveBeenCalled();
    });

    it('does not fail the request when publishing the event errors', async () => {
      prisma.lesson.findUnique.mockResolvedValue(lesson as any);
      prisma.activityEvent.findFirst.mockResolvedValue(null);
      prisma.activityEvent.create.mockResolvedValue({} as any);
      (amqpConnection.publish as jest.Mock).mockRejectedValue(new Error('broker unavailable'));

      await expect(service.complete('lesson-1', student)).resolves.toEqual({
        completed: true,
        alreadyCompleted: false,
      });
    });
  });

  describe('update', () => {
    it('denies a non-owning instructor', async () => {
      prisma.lesson.findUnique.mockResolvedValue(lesson as any);
      const otherInstructor: AuthenticatedUser = {
        userId: 'instructor-2',
        email: 'other@example.com',
        role: Role.INSTRUCTOR,
      };

      await expect(
        service.update('lesson-1', { title: 'New title' }, otherInstructor),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.lesson.update).not.toHaveBeenCalled();
    });
  });
});
