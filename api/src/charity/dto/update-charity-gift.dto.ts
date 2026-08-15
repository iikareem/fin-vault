import { IsDateString, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateCharityGiftDto {
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @IsDateString()
  occurredOn?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
