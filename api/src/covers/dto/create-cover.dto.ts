import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateCoverDto {
  @IsString()
  toUserId: string;

  @IsString()
  categoryId: string;

  @IsString()
  accountId: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsDateString()
  occurredOn: string;

  @IsOptional()
  @IsString()
  note?: string;
}
