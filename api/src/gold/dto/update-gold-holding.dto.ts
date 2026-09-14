import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateGoldHoldingDto {
  @IsOptional()
  @IsNumber()
  @Min(0.001)
  grams?: number;

  @IsOptional()
  @IsIn([18, 21, 24])
  karat?: 18 | 21 | 24;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;

  @IsOptional()
  @IsDateString()
  acquiredOn?: string | null;
}
