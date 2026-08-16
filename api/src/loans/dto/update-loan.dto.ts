import { IsDateString, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateLoanDto {
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsDateString()
  occurredOn?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
