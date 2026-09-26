import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class PaySubscriptionDto {
  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @IsDateString()
  occurredOn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
