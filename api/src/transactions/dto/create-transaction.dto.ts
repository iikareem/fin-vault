import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateTransactionDto {
  @IsIn(['EXPENSE', 'INCOME'])
  type: 'EXPENSE' | 'INCOME';

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsString()
  accountId: string;

  @IsString()
  categoryId: string;

  @IsDateString()
  occurredOn: string;

  @IsOptional()
  @IsString()
  note?: string;
}
