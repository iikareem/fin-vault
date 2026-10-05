import { IsIn, IsNumber, IsOptional, IsString, Matches, Min } from 'class-validator';

export const SOFT_LIMIT_MODES = ['PERSONAL', 'ALL'] as const;
export type SoftLimitModeDto = (typeof SOFT_LIMIT_MODES)[number];

export class UpsertMonthSoftLimitDto {
  /** Budget period YYYY-MM. Defaults to the current personal period. */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/)
  periodKey?: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsIn([...SOFT_LIMIT_MODES])
  mode: SoftLimitModeDto;
}
