import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsConsumer } from './notifications.consumer';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsConsumer],
  exports: [NotificationsService],
})
export class NotificationsModule {}
