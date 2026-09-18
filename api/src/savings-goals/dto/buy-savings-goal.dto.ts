import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class BuySavingsGoalDto {
  @IsOptional()
  @IsDateString()
  occurredOn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
