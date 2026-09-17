import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateOutsideLoanDto {
  @IsString()
  @MaxLength(80)
  personName: string;

  @IsOptional()
  @IsString()
  @IsIn(['LEND', 'BORROW'])
  direction?: 'LEND' | 'BORROW';

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsString()
  accountId: string;

  @IsDateString()
  occurredOn: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
