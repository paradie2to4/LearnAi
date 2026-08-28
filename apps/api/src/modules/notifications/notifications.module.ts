import { Module } from '@nestjs/common';
import { RabbitmqModule } from '../../rabbitmq/rabbitmq.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsConsumer } from './notifications.consumer';

@Module({
  imports: [RabbitmqModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsConsumer],
  exports: [NotificationsService],
})
export class NotificationsModule {}
