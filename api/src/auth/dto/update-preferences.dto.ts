import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

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
  'TRY',
] as const;

export const ADD_TYPES = ['EXPENSE', 'INCOME'] as const;

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

export const LOCALES = ['en', 'ar'] as const;

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

  /** Show this-month income/spend on the personal Home money box. Default false. */
  @IsOptional()
  @IsBoolean()
  showPersonalMonthSpend?: boolean;

  @IsOptional()
  @IsBoolean()
  hideBalances?: boolean;

  @IsOptional()
  @IsBoolean()
  reduceMotion?: boolean;

  @IsOptional()
  @IsBoolean()
  compactUi?: boolean;

  @IsOptional()
  @IsBoolean()
  largeText?: boolean;

  @IsOptional()
  @IsBoolean()
  showHomeTools?: boolean;

  @IsOptional()
  @IsString()
  @IsIn([...ADD_TYPES])
  defaultAddType?: (typeof ADD_TYPES)[number];

  @IsOptional()
  @IsBoolean()
  skipAddConfirm?: boolean;

  @IsOptional()
  @IsString()
  @IsIn([...LOCALES])
  locale?: (typeof LOCALES)[number];
}
