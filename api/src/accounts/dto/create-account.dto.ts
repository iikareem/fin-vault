import { IsEnum, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';
import { AccountType } from '@prisma/client';

export class CreateAccountDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsEnum(AccountType)
  type?: AccountType;

  @IsOptional()
  @IsNumber()
  openingBalance?: number;
}
