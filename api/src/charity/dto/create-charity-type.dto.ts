import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateCharityTypeDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyGoal?: number;
}
