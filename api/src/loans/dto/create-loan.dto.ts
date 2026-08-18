import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateLoanDto {
  @IsString()
  toUserId: string;

  @IsOptional()
  @IsIn(['I_GAVE', 'THEY_GAVE'])
  direction?: 'I_GAVE' | 'THEY_GAVE';

  @IsOptional()
  @IsIn(['TRACK_ONLY', 'CASH'])
  kind?: 'TRACK_ONLY' | 'CASH';

  @IsString()
  categoryId: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsDateString()
  occurredOn: string;

  @IsOptional()
  @IsString()
  note?: string;
}
