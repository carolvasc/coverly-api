import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import { BookDto, BookSearchResponseDto } from './dto/book.dto';

@Injectable()
export class BooksService {
  private readonly logger = new Logger(BooksService.name);
  private readonly googleBooksApiUrl = 'https://www.googleapis.com/books/v1/volumes';

  async searchBooks(
    query: string, 
    orderBy: 'relevance' | 'newest' = 'relevance',
    startIndex: number = 0,
    maxResults: number = 10
  ): Promise<BookSearchResponseDto> {
    try {
      this.logger.log(`Searching books with query: ${query}, orderBy: ${orderBy}, startIndex: ${startIndex}, maxResults: ${maxResults}`);
      
      const response = await axios.get(this.googleBooksApiUrl, {
        params: {
          q: query,
          orderBy,
          startIndex,
          maxResults: Math.min(maxResults, 40), // Google Books API limit
        },
        timeout: 5000,
      });

      const items = response.data.items || [];
      const books: BookDto[] = items.map((item: any) => ({
        id: item.id,
        title: item.volumeInfo.title || 'Unknown Title',
        authors: item.volumeInfo.authors || ['Unknown Author'],
        publisher: item.volumeInfo.publisher || 'Unknown Publisher',
        publishedDate: item.volumeInfo.publishedDate || 'Unknown',
        pageCount: item.volumeInfo.pageCount || 0,
        description: item.volumeInfo.description,
        thumbnail: item.volumeInfo.imageLinks?.thumbnail,
      }));

      this.logger.log(`Found ${books.length} books`);
      
      return {
        totalItems: response.data.totalItems || 0,
        items: books,
      };
    } catch (error) {
      this.logger.error('Failed to search books', error);
      
      if (error instanceof AxiosError) {
        if (error.response?.status === 429) {
          throw new InternalServerErrorException('Too many requests to Google Books API');
        }
        if (error.code === 'ECONNABORTED') {
          throw new InternalServerErrorException('Request timeout');
        }
      }
      
      throw new InternalServerErrorException('Failed to search books');
    }
  }
}