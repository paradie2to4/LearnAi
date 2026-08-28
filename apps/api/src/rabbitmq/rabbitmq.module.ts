import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RabbitMQModule as GolevelupRabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { EVENT_EXCHANGE } from '@learnai/shared';

/**
 * Thin wrapper around @golevelup/nestjs-rabbitmq that declares the single
 * `learnai.events` topic exchange (+ dead-letter exchange) used across the app.
 * Feature modules bind their own queues to this exchange via @RabbitSubscribe.
 */
@Module({
  imports: [
    GolevelupRabbitMQModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        exchanges: [
          { name: EVENT_EXCHANGE, type: 'topic' },
          { name: `${EVENT_EXCHANGE}.dlx`, type: 'topic' },
        ],
        uri: config.get<string>('RABBITMQ_URL') ?? 'amqp://localhost:5672',
        connectionInitOptions: { wait: false },
        enableControllerDiscovery: true,
      }),
    }),
  ],
  exports: [GolevelupRabbitMQModule],
})
export class RabbitmqModule {}
