import { Module } from '@nestjs/common';
import { RabbitmqModule } from '../../rabbitmq/rabbitmq.module';
import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';
import { ModulesController } from './modules.controller';
import { ModulesService } from './modules.service';
import { LessonsController } from './lessons.controller';
import { LessonsService } from './lessons.service';

@Module({
  imports: [RabbitmqModule],
  controllers: [CoursesController, ModulesController, LessonsController],
  providers: [CoursesService, ModulesService, LessonsService],
  exports: [CoursesService, ModulesService, LessonsService],
})
export class CoursesModule {}
