import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateGoldHoldingDto {
  @IsNumber()
  @Min(0.001)
  grams: number;

  @IsIn([18, 21, 24])
  karat: 18 | 21 | 24;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  paidAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;

  @IsOptional()
  @IsDateString()
  acquiredOn?: string;
}
