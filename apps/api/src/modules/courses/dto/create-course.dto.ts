import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateCourseDto {
  @ApiProperty({ example: 'Introduction to TypeScript' })
  @IsString()
  @MinLength(3)
  title!: string;

  @ApiProperty({ example: 'A hands-on introduction to TypeScript fundamentals.' })
  @IsString()
  @MinLength(10)
  description!: string;

  @ApiProperty({ example: 'subject-id' })
  @IsString()
  subjectId!: string;

  @ApiPropertyOptional({ description: 'ADMIN only: assign the course to a specific instructor' })
  @IsOptional()
  @IsString()
  instructorId?: string;
}
