import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SubmitAnswerDto {
  @ApiProperty({ description: 'Question this autosave applies to' })
  @IsString()
  @IsNotEmpty()
  questionId!: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Selected option ids, for MC/TF/MULTIPLE_ANSWER questions',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedOptionIds?: string[];

  @ApiPropertyOptional({ description: 'Free-text answer, for SHORT_ANSWER questions' })
  @IsOptional()
  @IsString()
  answerText?: string;
}
