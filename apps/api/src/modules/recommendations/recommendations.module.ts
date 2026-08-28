import { Module } from '@nestjs/common';
import { RabbitmqModule } from '../../rabbitmq/rabbitmq.module';
import { AiModule } from '../ai/ai.module';
import { RecommendationsController } from './recommendations.controller';
import { RecommendationService } from './recommendation.service';
import { WeakTopicDetectionService } from './weak-topic-detection.service';
import { RecommendationsConsumer } from './recommendations.consumer';

@Module({
  imports: [RabbitmqModule, AiModule],
  controllers: [RecommendationsController],
  providers: [RecommendationService, WeakTopicDetectionService, RecommendationsConsumer],
  exports: [RecommendationService, WeakTopicDetectionService],
})
export class RecommendationsModule {}
