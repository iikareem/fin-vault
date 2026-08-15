import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreatePayoutDto {
  @IsString()
  toUserId: string;

  @IsString()
  accountId: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsDateString()
  occurredOn: string;

  @IsOptional()
  @IsIn(['Allowance'])
  kind?: 'Allowance';

  @IsOptional()
  @IsString()
  note?: string;
}
