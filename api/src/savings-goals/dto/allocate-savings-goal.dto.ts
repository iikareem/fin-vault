import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class AllocateSavingsGoalDto {
  @IsNumber()
  @Min(0.01)
  amount: number;

  /** CURRENT moves cash into Savings then labels it; SAVINGS labels free Savings. */
  @IsIn(['CURRENT', 'SAVINGS'])
  from: 'CURRENT' | 'SAVINGS';

  @IsOptional()
  @IsDateString()
  occurredOn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
