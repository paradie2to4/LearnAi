import { Body, Controller, Delete, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@learnai/shared';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ModulesService } from './modules.service';
import { LessonsService } from './lessons.service';
import { UpdateModuleDto } from './dto/update-module.dto';
import { CreateLessonDto } from './dto/create-lesson.dto';

@ApiTags('modules')
@ApiBearerAuth()
@Controller('modules')
export class ModulesController {
  constructor(
    private readonly modulesService: ModulesService,
    private readonly lessonsService: LessonsService,
  ) {}

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateModuleDto, @CurrentUser() user: AuthenticatedUser) {
    return this.modulesService.update(id, dto, user);
  }

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.modulesService.remove(id, user);
  }

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Post(':id/lessons')
  createLesson(
    @Param('id') moduleId: string,
    @Body() dto: CreateLessonDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.lessonsService.create(moduleId, dto, user);
  }
}
