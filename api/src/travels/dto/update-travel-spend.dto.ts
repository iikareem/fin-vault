import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateTravelSpendDto {
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @IsString()
  categoryId?: string;

  /** CURRENT = deduct from Current wallet; CASH = log only (no wallet move). */
  @IsOptional()
  @IsIn(['CURRENT', 'CASH'])
  paidFrom?: 'CURRENT' | 'CASH';

  @IsOptional()
  @IsDateString()
  occurredOn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
