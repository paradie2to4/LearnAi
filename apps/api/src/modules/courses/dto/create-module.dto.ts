import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Min } from 'class-validator';

export class CreateModuleDto {
  @ApiProperty({ example: 'Getting Started' })
  @IsString()
  title!: string;

  @ApiProperty({ example: 0 })
  @IsInt()
  @Min(0)
  order!: number;
}
