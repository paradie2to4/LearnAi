import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@learnai/shared';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CoursesService } from './courses.service';
import { ModulesService } from './modules.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { CreateModuleDto } from './dto/create-module.dto';

@ApiTags('courses')
@ApiBearerAuth()
@Controller('courses')
export class CoursesController {
  constructor(
    private readonly coursesService: CoursesService,
    private readonly modulesService: ModulesService,
  ) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('subjectId') subjectId?: string,
    @Query('instructorId') instructorId?: string,
  ) {
    if (instructorId === 'me' && (user.role === Role.INSTRUCTOR || user.role === Role.ADMIN)) {
      return this.coursesService.findMine(user);
    }
    return this.coursesService.findPublished(subjectId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.coursesService.findOneDetail(id, user);
  }

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Post()
  create(@Body() dto: CreateCourseDto, @CurrentUser() user: AuthenticatedUser) {
    return this.coursesService.create(dto, user);
  }

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCourseDto, @CurrentUser() user: AuthenticatedUser) {
    return this.coursesService.update(id, dto, user);
  }

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @Post(':id/publish')
  publish(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.coursesService.publish(id, user);
  }

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Post(':id/modules')
  createModule(
    @Param('id') courseId: string,
    @Body() dto: CreateModuleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.modulesService.create(courseId, dto, user);
  }
}
