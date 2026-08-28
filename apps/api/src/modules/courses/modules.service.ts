import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { CreateModuleDto } from './dto/create-module.dto';
import { UpdateModuleDto } from './dto/update-module.dto';
import { assertInstructorOwnsCourse } from './course-ownership.util';

@Injectable()
export class ModulesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(courseId: string, dto: CreateModuleDto, user: AuthenticatedUser) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) {
      throw new NotFoundException('Course not found');
    }
    assertInstructorOwnsCourse(course, user);

    return this.withOrderConflictHandling(() =>
      this.prisma.module.create({
        data: { courseId, title: dto.title, order: dto.order },
      }),
    );
  }

  async update(id: string, dto: UpdateModuleDto, user: AuthenticatedUser) {
    const courseModule = await this.getModuleWithCourseOrThrow(id);
    assertInstructorOwnsCourse(courseModule.course, user);

    return this.withOrderConflictHandling(() => this.prisma.module.update({ where: { id }, data: dto }));
  }

  async remove(id: string, user: AuthenticatedUser): Promise<void> {
    const courseModule = await this.getModuleWithCourseOrThrow(id);
    assertInstructorOwnsCourse(courseModule.course, user);

    await this.prisma.module.delete({ where: { id } });
  }

  async getModuleWithCourseOrThrow(id: string) {
    const courseModule = await this.prisma.module.findUnique({
      where: { id },
      include: { course: true },
    });
    if (!courseModule) {
      throw new NotFoundException('Module not found');
    }
    return courseModule;
  }

  private async withOrderConflictHandling<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('A module with this order already exists in the course');
      }
      throw err;
    }
  }
}
