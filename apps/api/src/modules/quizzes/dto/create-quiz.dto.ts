import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateQuizDto {
  @ApiProperty({ example: 'Module 1 Checkpoint' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiPropertyOptional({
    description: 'Set for a course-final assessment quiz (mutually exclusive with lessonId in practice)',
  })
  @IsOptional()
  @IsString()
  courseId?: string;

  @ApiPropertyOptional({ description: 'Set for a per-lesson quiz' })
  @IsOptional()
  @IsString()
  lessonId?: string;

  @ApiPropertyOptional({ default: 70, minimum: 0, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  passingScore?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  timeLimitMinutes?: number;

  @ApiPropertyOptional({
    default: true,
    description: 'Whether MULTIPLE_ANSWER questions award partial credit',
  })
  @IsOptional()
  @IsBoolean()
  partialCreditMultiAnswer?: boolean;
}
