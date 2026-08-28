import { Body, Controller, Delete, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@learnai/shared';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { QuestionsService } from './questions.service';
import { UpdateQuestionDto } from './dto/update-question.dto';

@ApiTags('questions')
@ApiBearerAuth()
@Controller('questions')
export class QuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateQuestionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.questionsService.update(id, dto, user);
  }

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.questionsService.remove(id, user);
  }
}
