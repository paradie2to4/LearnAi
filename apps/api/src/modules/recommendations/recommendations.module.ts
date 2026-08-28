import { Module } from '@nestjs/common';
import { RecommendationsController } from './recommendations.controller';
import { RecommendationService } from './recommendation.service';
import { WeakTopicDetectionService } from './weak-topic-detection.service';
import { RecommendationsConsumer } from './recommendations.consumer';

/**
 * NOTE: this module does NOT import AiModule. It only declares a dependency
 * on the AI_PROVIDER token via @Inject in RecommendationService — the
 * concrete binding (AnthropicProvider) is expected to be provided by
 * AiModule once it's imported alongside this module in AppModule.
 */
@Module({
  controllers: [RecommendationsController],
  providers: [RecommendationService, WeakTopicDetectionService, RecommendationsConsumer],
  exports: [RecommendationService, WeakTopicDetectionService],
})
export class RecommendationsModule {}
