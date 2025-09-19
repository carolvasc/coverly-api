import { IsNotEmpty, IsString, IsOptional, IsIn, IsNumber, Min, Max } from 'class-validator';
import { Transform } from 'class-transformer';

export class SearchQueryDto {
  @IsNotEmpty()
  @IsString()
  q: string;

  @IsOptional()
  @IsIn(['relevance', 'newest'])
  orderBy?: 'relevance' | 'newest';

  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  @Min(0)
  startIndex?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  @Min(1)
  @Max(40)
  maxResults?: number;
}