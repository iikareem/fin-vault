import {
  IsDateString,
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

  @IsString()
  accountId: string;

  @IsDateString()
  occurredOn: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
