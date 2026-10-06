import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CollectOutsideLoanDto {
  @IsNumber()
  @Min(0.01)
  amount: number;

  /** CURRENT / SAVINGS move cash; NONE tracks only. Defaults to CURRENT. */
  @IsOptional()
  @IsString()
  @IsIn(['CURRENT', 'SAVINGS', 'NONE'])
  walletTarget?: 'CURRENT' | 'SAVINGS' | 'NONE';

  /** Legacy: explicit cash wallet when walletTarget is omitted. */
  @IsOptional()
  @IsString()
  accountId?: string;

  @IsDateString()
  occurredOn: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
