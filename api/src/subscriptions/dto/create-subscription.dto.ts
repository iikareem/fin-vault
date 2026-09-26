import {
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

export class CreateSubscriptionDto {
  @IsString()
  @MaxLength(80)
  name: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsInt()
  @Min(1)
  @Max(28)
  billingDay: number;

  @IsOptional()
  @IsEnum(SubscriptionKind)
  kind?: SubscriptionKind;

  /** Required when kind is INSTALLMENT. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(360)
  totalInstallments?: number;

  @IsString()
  categoryId: string;

  @IsString()
  accountId: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  color?: string;
}
