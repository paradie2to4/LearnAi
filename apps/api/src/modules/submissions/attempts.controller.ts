import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@learnai/shared';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AttemptsService } from './attempts.service';
import { SubmitAnswerDto } from './dto/submit-answer.dto';

@ApiTags('submissions')
@ApiBearerAuth()
@Controller()
export class AttemptsController {
  constructor(private readonly attemptsService: AttemptsService) {}

  @Roles(Role.STUDENT)
  @Post('quizzes/:id/attempts')
  startAttempt(@Param('id') quizId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.attemptsService.startAttempt(quizId, user);
  }

  @Patch('attempts/:id/answers')
  saveAnswer(
    @Param('id') attemptId: string,
    @Body() dto: SubmitAnswerDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.attemptsService.saveAnswer(attemptId, dto, user);
  }

  @Post('attempts/:id/submit')
  submit(@Param('id') attemptId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.attemptsService.submit(attemptId, user);
  }

  @Get('attempts/:id')
  getAttempt(@Param('id') attemptId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.attemptsService.getAttempt(attemptId, user);
  }
}
