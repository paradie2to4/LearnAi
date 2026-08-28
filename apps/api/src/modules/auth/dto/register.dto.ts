import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { Role } from '@learnai/shared';

export class RegisterDto {
  @ApiProperty({ example: 'student@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Str0ng!Passw0rd' })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ example: 'Ada' })
  @IsString()
  firstName!: string;

  @ApiProperty({ example: 'Lovelace' })
  @IsString()
  lastName!: string;

  @ApiProperty({ enum: [Role.STUDENT, Role.INSTRUCTOR], required: false, default: Role.STUDENT })
  @IsOptional()
  @IsEnum(Role)
  @IsIn([Role.STUDENT, Role.INSTRUCTOR])
  role?: Role;
}
