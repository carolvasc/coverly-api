import { Test, TestingModule } from '@nestjs/testing';
import { BooksController } from './books.controller';
import { BooksService } from './books.service';
import { BookSearchResponseDto } from './dto/book.dto';

describe('BooksController', () => {
  let controller: BooksController;
  let service: { searchBooks: jest.Mock };

  beforeEach(async () => {
    service = {
      searchBooks: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BooksController],
      providers: [
        {
          provide: BooksService,
          useValue: service,
        },
      ],
    }).compile();

    controller = module.get(BooksController);
  });

  it('delegates to BooksService with validated query params', async () => {
    const expected: BookSearchResponseDto = { totalItems: 0, items: [] };
    service.searchBooks.mockResolvedValue(expected);

    const result = await controller.searchBooks({
      q: 'react',
      orderBy: 'newest',
      startIndex: 5,
      maxResults: 15,
    });

    expect(service.searchBooks).toHaveBeenCalledWith('react', 'newest', 5, 15);
    expect(result).toBe(expected);
  });

  it('propagates service errors', async () => {
    service.searchBooks.mockRejectedValue(new Error('boom'));

    await expect(
      controller.searchBooks({ q: 'ddd', orderBy: 'relevance' }),
    ).rejects.toThrow('boom');
  });
});
