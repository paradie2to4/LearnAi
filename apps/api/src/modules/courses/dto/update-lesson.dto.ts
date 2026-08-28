import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateLessonDto {
  @ApiPropertyOptional({ example: 'Variables and Types' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: 'In this lesson we cover...' })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @ApiPropertyOptional({ example: 'topic-id' })
  @IsOptional()
  @IsString()
  topicId?: string;

  @ApiPropertyOptional({ example: 15 })
  @IsOptional()
  @IsInt()
  @Min(1)
  estimatedMinutes?: number;
}
