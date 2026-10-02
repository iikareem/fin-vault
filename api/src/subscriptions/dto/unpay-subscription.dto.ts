import { IsOptional, IsString, Matches } from 'class-validator';

export class UnpaySubscriptionDto {
  /** Budget period YYYY-MM to undo. Defaults to the current period. */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/)
  periodKey?: string;
}
