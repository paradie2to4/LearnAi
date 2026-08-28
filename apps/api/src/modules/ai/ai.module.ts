import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AI_PROVIDER } from './ai.constants';
import { AnthropicProvider } from './anthropic.provider';
import { AiQuestionGenerationService } from './ai-question-generation.service';
import { DraftReviewService } from './draft-review.service';
import { ExplanationService } from './explanation.service';
import { StudyAssistantService } from './study-assistant.service';
import { AiController } from './ai.controller';

/**
 * PrismaModule is @Global, so it doesn't need to be imported here for
 * PrismaService injection to resolve (same pattern as RecommendationsModule).
 */
@Module({
  imports: [ConfigModule],
  controllers: [AiController],
  providers: [
    { provide: AI_PROVIDER, useClass: AnthropicProvider },
    AiQuestionGenerationService,
    DraftReviewService,
    ExplanationService,
    StudyAssistantService,
  ],
  exports: [AI_PROVIDER],
})
export class AiModule {}
