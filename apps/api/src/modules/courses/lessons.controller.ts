import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@learnai/shared';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { LessonsService } from './lessons.service';
import { UpdateLessonDto } from './dto/update-lesson.dto';

@ApiTags('lessons')
@ApiBearerAuth()
@Controller('lessons')
export class LessonsController {
  constructor(private readonly lessonsService: LessonsService) {}

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.lessonsService.findOne(id, user);
  }

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateLessonDto, @CurrentUser() user: AuthenticatedUser) {
    return this.lessonsService.update(id, dto, user);
  }

  @Roles(Role.STUDENT)
  @HttpCode(HttpStatus.OK)
  @Post(':id/complete')
  complete(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.lessonsService.complete(id, user);
  }
}
