import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

export class ManageUpdateCategoryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  nameAr?: string;

  @IsOptional()
  @IsString()
  @Matches(COLOR_RE)
  color?: string;

  /** Pass empty string to clear. */
  @IsOptional()
  @IsString()
  @MaxLength(16)
  emoji?: string;

  /** Pass empty string to clear parent (make top-level). */
  @IsOptional()
  @IsString()
  parentId?: string | null;
}
