import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class StudyAssistantHistoryMessageDto {
  @ApiProperty({ enum: ['user', 'assistant'] })
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  content!: string;
}

export class StudyAssistantAskDto {
  @ApiProperty({ example: 'Why is my answer about photosynthesis wrong?' })
  @IsString()
  @IsNotEmpty()
  question!: string;

  @ApiPropertyOptional({
    type: [StudyAssistantHistoryMessageDto],
    description: 'Prior turns of this conversation, oldest first',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => StudyAssistantHistoryMessageDto)
  history?: StudyAssistantHistoryMessageDto[];
}
