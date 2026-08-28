import { Module } from '@nestjs/common';
import { RabbitmqModule } from '../../rabbitmq/rabbitmq.module';
import { AttemptsController } from './attempts.controller';
import { AttemptsService } from './attempts.service';
import { ScoringService } from './scoring.service';

@Module({
  imports: [RabbitmqModule],
  controllers: [AttemptsController],
  providers: [AttemptsService, ScoringService],
  exports: [ScoringService],
})
export class SubmissionsModule {}
