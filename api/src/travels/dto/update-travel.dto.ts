import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { TRAVEL_CURRENCIES } from './create-travel.dto';

export class UpdateTravelDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsIn([...TRAVEL_CURRENCIES])
  currency?: (typeof TRAVEL_CURRENCIES)[number];

  @IsOptional()
  @IsDateString()
  startsOn?: string;

  @IsOptional()
  @IsDateString()
  endsOn?: string;

  /** Pass null to clear the soft limit. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsNumber()
  @Min(0.01)
  softLimit?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
