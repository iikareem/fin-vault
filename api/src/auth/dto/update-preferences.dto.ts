import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export const CURRENCIES = [
  'EGP',
  'SAR',
  'USD',
  'LYD',
  'AED',
  'EUR',
  'GBP',
  'KWD',
  'QAR',
  'BHD',
] as const;

export const THEMES = [
  'light',
  'dark',
  'midnight',
  'blue',
  'ocean',
  'mint',
  'forest',
  'sand',
  'amber',
  'rose',
  'grape',
  'slate',
] as const;

export class UpdatePreferencesDto {
  @IsOptional()
  @IsString()
  @IsIn([...CURRENCIES])
  preferredCurrency?: (typeof CURRENCIES)[number];

  @IsOptional()
  @IsString()
  @IsIn([...THEMES])
  theme?: (typeof THEMES)[number];

  /** Personal budget period start day (1–28). House books ignore this. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(28)
  budgetMonthStartDay?: number;
}
