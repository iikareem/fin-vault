import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateCoverRepaymentDto {
  @IsNumber()
  @Min(0.01)
  amount: number;

  /** Personal cash wallet the member pays from (Current or Savings). */
  @IsString()
  accountId: string;

  /** Optional house cash wallet that receives the money. Defaults to house Current. */
  @IsOptional()
  @IsString()
  houseAccountId?: string;

  @IsDateString()
  occurredOn: string;

  @IsOptional()
  @IsString()
  note?: string;
}
