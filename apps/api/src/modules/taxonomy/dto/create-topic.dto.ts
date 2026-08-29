import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateTopicDto {
  @ApiProperty({ example: 'Database Transactions' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 'subject-id-here' })
  @IsString()
  @IsNotEmpty()
  subjectId!: string;
}
