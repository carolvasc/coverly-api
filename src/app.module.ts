import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BooksModule } from './books/books.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), BooksModule],
})
export class AppModule {}
