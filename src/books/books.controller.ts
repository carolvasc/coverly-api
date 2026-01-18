import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { BooksService } from './books.service';
import { BookSearchResponseDto } from './dto/book.dto';
import { SearchQueryDto } from './dto/search-query.dto';

@Controller('books')
export class BooksController {
  constructor(private readonly booksService: BooksService) {}

  @Get('search')
  async searchBooks(@Query() searchQuery: SearchQueryDto): Promise<BookSearchResponseDto> {
    if (!searchQuery.q || searchQuery.q.trim().length === 0) {
      throw new BadRequestException('Search query cannot be empty');
    }

    const normalizedQuery = searchQuery.q.trim();

    return this.booksService.searchBooks(
      normalizedQuery,
      searchQuery.orderBy,
      searchQuery.startIndex,
      searchQuery.maxResults,
    );
  }

  @Get('cover')
  async getCover(@Query('url') url: string): Promise<{ dataUrl: string }> {
    const { contentType, base64 } = await this.booksService.fetchCoverImage(url);

    return {
      dataUrl: `data:${contentType};base64,${base64}`,
    };
  }
}
