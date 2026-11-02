import { IsOptional, IsString, Matches } from 'class-validator';

export class SkipSubscriptionDto {
  /** Budget period YYYY-MM to skip. Defaults to the current period. */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/)
  periodKey?: string;
}
