import { Transform } from 'class-transformer';
import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  @Transform(({ value }) => String(value ?? '').trim().toLowerCase())
  @IsString()
  @MinLength(3)
  email: string;

  @Transform(({ value }) => String(value ?? ''))
  @IsString()
  @MinLength(4)
  password: string;
}
