import { Module } from '@nestjs/common';
import { RabbitmqModule } from '../../rabbitmq/rabbitmq.module';
import { ProgressController } from './progress.controller';
import { ProgressService } from './progress.service';
import { ProgressConsumer } from './progress.consumer';

@Module({
  imports: [RabbitmqModule],
  controllers: [ProgressController],
  providers: [ProgressService, ProgressConsumer],
  exports: [ProgressService],
})
export class ProgressModule {}
