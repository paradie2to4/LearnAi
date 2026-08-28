import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@learnai/shared';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AnalyticsService } from './analytics.service';

@ApiTags('analytics')
@ApiBearerAuth()
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Get('courses/:id')
  getCourseAnalytics(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.analyticsService.getCourseAnalytics(id, user);
  }

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Get('students/:id')
  getStudentAnalytics(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.analyticsService.getStudentAnalytics(id, user);
  }

  @Roles(Role.ADMIN)
  @Get('platform')
  getPlatformAnalytics() {
    return this.analyticsService.getPlatformAnalytics();
  }
}
