import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export const TRAVEL_CURRENCIES = [
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

export class CreateTravelDto {
  @IsString()
  @MaxLength(80)
  name: string;

  @IsIn([...TRAVEL_CURRENCIES])
  currency: (typeof TRAVEL_CURRENCIES)[number];

  @IsDateString()
  startsOn: string;

  @IsDateString()
  endsOn: string;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  softLimit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
