import { Controller, Get, Query } from '@nestjs/common';
import { TogglService } from './toggl.service';
import { BookHoursQueryDto } from './dto/book-hours-query.dto';

@Controller('toggl')
export class TogglController {
  constructor(private readonly togglService: TogglService) {}

  @Get('books')
  async getBookHours(@Query() query: BookHoursQueryDto): Promise<{ hours: number }> {
    const hours = await this.togglService.findBookHours(query.title);
    return { hours };
  }
}
