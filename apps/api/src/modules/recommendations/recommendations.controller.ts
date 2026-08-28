import { Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@learnai/shared';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RecommendationService } from './recommendation.service';
import { WeakTopicDetectionService } from './weak-topic-detection.service';

@ApiTags('recommendations')
@ApiBearerAuth()
@Controller()
export class RecommendationsController {
  constructor(
    private readonly recommendationService: RecommendationService,
    private readonly weakTopicDetectionService: WeakTopicDetectionService,
  ) {}

  @Roles(Role.STUDENT)
  @Get('recommendations/me')
  getMyRecommendations(@CurrentUser() user: AuthenticatedUser) {
    return this.recommendationService.getForUser(user.userId);
  }

  @Patch('recommendations/:id/dismiss')
  dismiss(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.recommendationService.dismiss(user.userId, id);
  }

  @Roles(Role.STUDENT)
  @Get('weak-topics/me')
  getMyWeakTopics(@CurrentUser() user: AuthenticatedUser) {
    return this.weakTopicDetectionService.getUnresolvedForUser(user.userId);
  }
}
