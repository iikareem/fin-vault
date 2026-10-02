import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { SubscriptionKind } from '@prisma/client';

export class UpdateSubscriptionDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(28)
  billingDay?: number;

  @IsOptional()
  @IsEnum(SubscriptionKind)
  kind?: SubscriptionKind;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(360)
  totalInstallments?: number | null;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/)
  startPeriodKey?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  color?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
