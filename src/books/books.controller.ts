import { Controller, Get, Query } from '@nestjs/common';
import { BooksService } from './books.service';
import { BookSearchResponseDto } from './dto/book.dto';
import { SearchQueryDto } from './dto/search-query.dto';

@Controller('books')
export class BooksController {
  constructor(private readonly booksService: BooksService) {}

  @Get('search')
  async searchBooks(@Query() searchQuery: SearchQueryDto): Promise<BookSearchResponseDto> {
    return this.booksService.searchBooks(
      searchQuery.q,
      searchQuery.orderBy,
      searchQuery.startIndex,
      searchQuery.maxResults,
    );
  }
}
