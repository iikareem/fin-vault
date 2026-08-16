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

  @IsString()
  accountId: string;

  @IsDateString()
  occurredOn: string;

  @IsOptional()
  @IsString()
  note?: string;
}
