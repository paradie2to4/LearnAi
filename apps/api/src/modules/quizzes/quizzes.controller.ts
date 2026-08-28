import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@learnai/shared';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { QuizzesService } from './quizzes.service';
import { QuestionsService } from './questions.service';
import { CreateQuizDto } from './dto/create-quiz.dto';
import { UpdateQuizDto } from './dto/update-quiz.dto';
import { CreateQuestionDto } from './dto/create-question.dto';

@ApiTags('quizzes')
@ApiBearerAuth()
@Controller('quizzes')
export class QuizzesController {
  constructor(
    private readonly quizzesService: QuizzesService,
    private readonly questionsService: QuestionsService,
  ) {}

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Post()
  create(@Body() dto: CreateQuizDto, @CurrentUser() user: AuthenticatedUser) {
    return this.quizzesService.create(dto, user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.quizzesService.findOne(id, user);
  }

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateQuizDto, @CurrentUser() user: AuthenticatedUser) {
    return this.quizzesService.update(id, dto, user);
  }

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Post(':id/publish')
  publish(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.quizzesService.publish(id, user);
  }

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Post(':id/questions')
  addQuestion(
    @Param('id') id: string,
    @Body() dto: CreateQuestionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.questionsService.create(id, dto, user);
  }
}
