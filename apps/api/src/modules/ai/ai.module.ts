import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AI_PROVIDER } from './ai.constants';
import { GeminiProvider } from './gemini.provider';
import { AiQuestionGenerationService } from './ai-question-generation.service';
import { DraftReviewService } from './draft-review.service';
import { ExplanationService } from './explanation.service';
import { StudyAssistantService } from './study-assistant.service';
import { AiController } from './ai.controller';

/**
 * PrismaModule is @Global, so it doesn't need to be imported here for
 * PrismaService injection to resolve (same pattern as RecommendationsModule).
 *
 * GeminiProvider is the default AI_PROVIDER binding - Google AI Studio issues a
 * genuinely free API key, unlike Anthropic's pay-as-you-go-only API. To switch
 * providers, change `useClass` below (e.g. back to `AnthropicProvider`, still in
 * this directory) - nothing else in the app references a concrete provider.
 */
@Module({
  imports: [ConfigModule],
  controllers: [AiController],
  providers: [
    { provide: AI_PROVIDER, useClass: GeminiProvider },
    AiQuestionGenerationService,
    DraftReviewService,
    ExplanationService,
    StudyAssistantService,
  ],
  exports: [AI_PROVIDER],
})
export class AiModule {}
