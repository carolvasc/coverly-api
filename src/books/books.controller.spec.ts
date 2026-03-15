import { BadRequestException } from '@nestjs/common';
import { BooksController } from './books.controller';
import { BooksService } from './books.service';

describe('BooksController', () => {
  let controller: BooksController;
  let booksService: jest.Mocked<BooksService>;

  beforeEach(() => {
    booksService = {
      searchBooks: jest.fn(),
      fetchCoverImage: jest.fn(),
    } as unknown as jest.Mocked<BooksService>;

    controller = new BooksController(booksService);
  });

  it('rejects blank search queries', async () => {
    await expect(controller.searchBooks({ q: '   ' })).rejects.toBeInstanceOf(BadRequestException);
    expect(booksService.searchBooks).not.toHaveBeenCalled();
  });

  it('normalizes the query before delegating to the service', async () => {
    booksService.searchBooks.mockResolvedValueOnce({ totalItems: 1, items: [] });

    await controller.searchBooks({
      q: '  dune  ',
      orderBy: 'newest',
      startIndex: 2,
      maxResults: 5,
    });

    expect(booksService.searchBooks).toHaveBeenCalledWith('dune', 'newest', 2, 5);
  });

  it('returns a data url from the cover endpoint', async () => {
    booksService.fetchCoverImage.mockResolvedValueOnce({
      contentType: 'image/png',
      base64: 'abc123',
    });

    await expect(controller.getCover('https://books.google.com/books/content?id=1')).resolves.toEqual({
      dataUrl: 'data:image/png;base64,abc123',
    });
  });
});
