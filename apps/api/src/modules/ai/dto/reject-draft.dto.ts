import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RejectDraftDto {
  @ApiProperty({ example: 'The distractors are too easy to eliminate.' })
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
