import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { RabbitmqModule } from './rabbitmq/rabbitmq.module';
import { validateEnv } from './config/env.validation';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CoursesModule } from './modules/courses/courses.module';
import { EnrollmentsModule } from './modules/enrollments/enrollments.module';
import { QuizzesModule } from './modules/quizzes/quizzes.module';
import { SubmissionsModule } from './modules/submissions/submissions.module';
import { ProgressModule } from './modules/progress/progress.module';
import { RecommendationsModule } from './modules/recommendations/recommendations.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AiModule } from './modules/ai/ai.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { TaxonomyModule } from './modules/taxonomy/taxonomy.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: (Number(process.env.THROTTLE_TTL) || 60) * 1000,
          limit: Number(process.env.THROTTLE_LIMIT) || 100,
        },
      ],
    }),
    PrismaModule,
    RabbitmqModule,
    AuthModule,
    UsersModule,
    CoursesModule,
    EnrollmentsModule,
    QuizzesModule,
    SubmissionsModule,
    ProgressModule,
    RecommendationsModule,
    NotificationsModule,
    AiModule,
    AnalyticsModule,
    TaxonomyModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
