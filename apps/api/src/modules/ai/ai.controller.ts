import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { DraftStatus, Role } from '@learnai/shared';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AiQuestionGenerationService } from './ai-question-generation.service';
import { DraftReviewService } from './draft-review.service';
import { ExplanationService } from './explanation.service';
import { StudyAssistantService } from './study-assistant.service';
import { GenerateQuestionsDto } from './dto/generate-questions.dto';
import { RejectDraftDto } from './dto/reject-draft.dto';
import { StudyAssistantAskDto } from './dto/study-assistant-ask.dto';

@ApiTags('ai')
@ApiBearerAuth()
@Controller('ai')
export class AiController {
  constructor(
    private readonly questionGeneration: AiQuestionGenerationService,
    private readonly draftReview: DraftReviewService,
    private readonly explanation: ExplanationService,
    private readonly studyAssistant: StudyAssistantService,
  ) {}

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('questions/generate')
  generateQuestions(@CurrentUser() user: AuthenticatedUser, @Body() dto: GenerateQuestionsDto) {
    return this.questionGeneration.generateDraftQuestions(user.userId, dto, user);
  }

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Get('drafts')
  listDrafts(@CurrentUser() user: AuthenticatedUser, @Query('status') status?: DraftStatus) {
    return this.draftReview.listDrafts(user, status);
  }

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Post('drafts/:id/approve')
  approveDraft(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.draftReview.approve(id, user);
  }

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Post('drafts/:id/reject')
  rejectDraft(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: RejectDraftDto) {
    return this.draftReview.reject(id, user, dto.reason);
  }

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Post('drafts/:id/publish')
  publishDraft(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.draftReview.publish(id, user);
  }

  @Roles(Role.STUDENT)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('study-assistant/ask')
  askStudyAssistant(@CurrentUser() user: AuthenticatedUser, @Body() dto: StudyAssistantAskDto) {
    return this.studyAssistant.ask(user.userId, dto.question, dto.history ?? []);
  }

  @Post('explain/:answerSubmissionId')
  explainAnswer(
    @Param('answerSubmissionId') answerSubmissionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.explanation.explainAnswer(user.userId, answerSubmissionId);
  }
}
