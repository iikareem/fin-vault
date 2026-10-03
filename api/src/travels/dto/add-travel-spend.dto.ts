import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class AddTravelSpendDto {
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsString()
  categoryId: string;

  /** CURRENT = deduct from Current wallet; CASH = log only (no wallet move). */
  @IsIn(['CURRENT', 'CASH'])
  paidFrom: 'CURRENT' | 'CASH';

  @IsDateString()
  occurredOn: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
