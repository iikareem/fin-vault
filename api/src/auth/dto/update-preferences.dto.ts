import { IsIn, IsOptional, IsString } from 'class-validator';

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

export const THEMES = ['light', 'dark', 'ocean', 'sand', 'rose'] as const;

export class UpdatePreferencesDto {
  @IsOptional()
  @IsString()
  @IsIn([...CURRENCIES])
  preferredCurrency?: (typeof CURRENCIES)[number];

  @IsOptional()
  @IsString()
  @IsIn([...THEMES])
  theme?: (typeof THEMES)[number];
}
