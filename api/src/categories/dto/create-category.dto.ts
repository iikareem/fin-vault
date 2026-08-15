import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { CategoryKind } from '@prisma/client';

export class CreateCategoryDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsEnum(CategoryKind)
  kind: CategoryKind;

  @IsOptional()
  @IsString()
  color?: string;
}
