import { IsNotEmpty, IsString } from 'class-validator';

export class BookHoursQueryDto {
  @IsString()
  @IsNotEmpty()
  title!: string;
}
