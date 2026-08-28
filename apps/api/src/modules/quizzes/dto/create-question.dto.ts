import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { QuestionType } from '@learnai/shared';
import { QuestionOptionInputDto } from './question-option.dto';

const OPTION_BASED_TYPES: QuestionType[] = [
  QuestionType.MULTIPLE_CHOICE,
  QuestionType.TRUE_FALSE,
  QuestionType.MULTIPLE_ANSWER,
];

/**
 * DTO-level validation only enforces the *shape* per question type (options
 * array required for MC/TF/MULTIPLE_ANSWER, correctAnswerText required for
 * SHORT_ANSWER). The exact-count / at-least-one-correct invariants are
 * enforced in QuestionsService, which is the source of truth and runs on
 * both create and update.
 */
export class CreateQuestionDto {
  @ApiProperty({ enum: QuestionType })
  @IsEnum(QuestionType)
  type!: QuestionType;

  @ApiProperty({ example: 'What is the capital of France?' })
  @IsString()
  @IsNotEmpty()
  prompt!: string;

  @ApiProperty({ description: 'Topic this question is tagged with, for mastery/analytics rollups' })
  @IsString()
  @IsNotEmpty()
  topicId!: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  points?: number;

  @ApiProperty({ example: 0 })
  @IsInt()
  @Min(0)
  order!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  explanation?: string;

  @ApiPropertyOptional({
    type: [QuestionOptionInputDto],
    description: 'Required for MULTIPLE_CHOICE, TRUE_FALSE, MULTIPLE_ANSWER',
  })
  @ValidateIf((o: CreateQuestionDto) => OPTION_BASED_TYPES.includes(o.type))
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionInputDto)
  options?: QuestionOptionInputDto[];

  @ApiPropertyOptional({ description: 'Required for SHORT_ANSWER' })
  @ValidateIf((o: CreateQuestionDto) => o.type === QuestionType.SHORT_ANSWER)
  @IsString()
  @IsNotEmpty()
  correctAnswerText?: string;

  @ApiPropertyOptional({ type: [String], description: 'Additional accepted phrasings for SHORT_ANSWER' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  acceptableAnswers?: string[];
}
