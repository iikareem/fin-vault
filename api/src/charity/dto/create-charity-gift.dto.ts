import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateCharityGiftDto {
  @IsString()
  typeId: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsDateString()
  occurredOn: string;

  @IsOptional()
  @IsString()
  note?: string;
}
