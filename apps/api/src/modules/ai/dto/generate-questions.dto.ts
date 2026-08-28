import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { QuestionType } from '@learnai/shared';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export type QuestionDifficulty = 'EASY' | 'MEDIUM' | 'HARD';

export class GenerateQuestionsDto {
  @ApiProperty({ description: 'Topic to generate questions for' })
  @IsString()
  @IsNotEmpty()
  topicId!: string;

  @ApiPropertyOptional({ description: 'Quiz these drafts are intended for (required later to publish)' })
  @IsOptional()
  @IsString()
  quizId?: string;

  @ApiProperty({ example: 5, minimum: 1, maximum: 20 })
  @IsInt()
  @Min(1)
  @Max(20)
  count!: number;

  @ApiPropertyOptional({ enum: ['EASY', 'MEDIUM', 'HARD'], default: 'MEDIUM' })
  @IsOptional()
  @IsEnum(['EASY', 'MEDIUM', 'HARD'])
  difficulty?: QuestionDifficulty;

  @ApiPropertyOptional({ enum: QuestionType, description: 'Restrict generation to a single question type' })
  @IsOptional()
  @IsEnum(QuestionType)
  questionType?: QuestionType;
}
