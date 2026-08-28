import { Module } from '@nestjs/common';
import { ProgressController } from './progress.controller';
import { ProgressService } from './progress.service';
import { ProgressConsumer } from './progress.consumer';

@Module({
  controllers: [ProgressController],
  providers: [ProgressService, ProgressConsumer],
  exports: [ProgressService],
})
export class ProgressModule {}
