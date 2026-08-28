import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

/**
 * One option belonging to a MULTIPLE_CHOICE / TRUE_FALSE / MULTIPLE_ANSWER question.
 * Shared between create and update question DTOs.
 */
export class QuestionOptionInputDto {
  @ApiProperty({ example: 'Paris' })
  @IsString()
  @IsNotEmpty()
  text!: string;

  @ApiProperty({ example: false })
  @IsBoolean()
  isCorrect!: boolean;

  @ApiProperty({ example: 0 })
  @IsInt()
  @Min(0)
  order!: number;
}
