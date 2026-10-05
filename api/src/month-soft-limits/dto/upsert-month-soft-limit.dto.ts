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

  /** Day-to-day ceiling. Null clears it. Omit to leave unchanged is not supported — send both. */
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsNumber()
  @Min(0.01)
  personalAmount?: number | null;

  /** All-spend ceiling (incl. commitments). Null clears it. */
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsNumber()
  @Min(0.01)
  totalAmount?: number | null;
}
