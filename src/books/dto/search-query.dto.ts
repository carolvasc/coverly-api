import { IsNotEmpty, IsString, IsOptional, IsIn, IsInt, Min, Max } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class SearchQueryDto {
  @IsNotEmpty()
  @IsString()
  q: string;

  @IsOptional()
  @IsIn(['relevance', 'newest'])
  orderBy?: 'relevance' | 'newest';

  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null || value === '' ? undefined : value))
  @Type(() => Number)
  @IsInt()
  @Min(0)
  startIndex?: number;

  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null || value === '' ? undefined : value))
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(40)
  maxResults?: number;
}
