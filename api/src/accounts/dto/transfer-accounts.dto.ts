import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class TransferAccountsDto {
  @IsString()
  fromAccountId: string;

  @IsString()
  toAccountId: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsDateString()
  occurredOn: string;

  @IsOptional()
  @IsString()
  note?: string;
}
