import { IsDateString, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class PaySubscriptionDto {
  @IsOptional()
  @IsString()
  accountId?: string;

  /** Budget period YYYY-MM to mark paid. Defaults to the current period. */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/)
  periodKey?: string;

  @IsOptional()
  @IsDateString()
  occurredOn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
