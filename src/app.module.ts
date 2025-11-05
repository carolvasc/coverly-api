import { Module } from '@nestjs/common';
import { BooksModule } from './books/books.module';
import { TogglModule } from './toggl/toggl.module';

@Module({
  imports: [BooksModule, TogglModule],
})
export class AppModule {}
