import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@learnai/shared';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { EnrollmentsService } from './enrollments.service';

@ApiTags('enrollments')
@ApiBearerAuth()
@Controller()
export class EnrollmentsController {
  constructor(private readonly enrollmentsService: EnrollmentsService) {}

  @Roles(Role.STUDENT)
  @Post('courses/:id/enroll')
  enroll(@Param('id') courseId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.enrollmentsService.enroll(courseId, user);
  }

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Get('courses/:id/enrollments')
  getRoster(@Param('id') courseId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.enrollmentsService.getRoster(courseId, user);
  }

  @Roles(Role.STUDENT)
  @Get('enrollments/me')
  getMine(@CurrentUser() user: AuthenticatedUser) {
    return this.enrollmentsService.findMine(user);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('enrollments/:id')
  async drop(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.enrollmentsService.drop(id, user);
  }
}
