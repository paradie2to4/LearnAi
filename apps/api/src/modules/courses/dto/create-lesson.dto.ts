import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateLessonDto {
  @ApiProperty({ example: 'Variables and Types' })
  @IsString()
  title!: string;

  @ApiProperty({ example: 'In this lesson we cover...' })
  @IsString()
  content!: string;

  @ApiProperty({ example: 0 })
  @IsInt()
  @Min(0)
  order!: number;

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
