import { Module } from '@nestjs/common';
import { QuizzesController } from './quizzes.controller';
import { QuizzesService } from './quizzes.service';
import { QuestionsController } from './questions.controller';
import { QuestionsService } from './questions.service';

@Module({
  controllers: [QuizzesController, QuestionsController],
  providers: [QuizzesService, QuestionsService],
  exports: [QuizzesService, QuestionsService],
})
export class QuizzesModule {}
