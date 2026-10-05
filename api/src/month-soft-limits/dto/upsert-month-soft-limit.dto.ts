import {
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateIf,
} from 'class-validator';

export class UpsertMonthSoftLimitDto {
  /** Budget period YYYY-MM. Defaults to the current personal period. */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/)
  periodKey?: string;

  /** Save target for the period. Null clears the plan. */
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsNumber()
  @Min(0.01)
  saveTargetAmount?: number | null;
}
