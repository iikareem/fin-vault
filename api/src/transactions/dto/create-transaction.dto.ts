import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateTransactionDto {
  @IsIn(['EXPENSE', 'INCOME', 'TRACK'])
  type: 'EXPENSE' | 'INCOME' | 'TRACK';

  @IsNumber()
  @Min(0.01)
  amount: number;

  /** Required for cash EXPENSE/INCOME. Optional for TRACK (uses Current if omitted). */
  @IsOptional()
  @IsString()
  accountId?: string;

  @IsString()
  categoryId: string;

  @IsDateString()
  occurredOn: string;

  @IsOptional()
  @IsString()
  note?: string;
}
