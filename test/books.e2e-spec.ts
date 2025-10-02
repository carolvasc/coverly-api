import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { BooksService } from '../src/books/books.service';

describe('BooksController (e2e)', () => {
  let app: INestApplication;
  const mockResult = {
    totalItems: 1,
    items: [
      {
        id: '123',
        title: 'Example Book',
        authors: ['Author One'],
        publisher: 'Publisher',
        publishedDate: '2024',
        pageCount: 321,
        description: 'Example description',
        thumbnail: 'thumb.png',
      },
    ],
  };

  const booksServiceMock = {
    searchBooks: jest.fn().mockResolvedValue(mockResult),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(BooksService)
      .useValue(booksServiceMock)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
  });

  afterEach(() => {
    booksServiceMock.searchBooks.mockClear();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns books from the service', async () => {
    const response = await request(app.getHttpServer())
      .get('/books/search')
      .query({ q: 'nestjs' })
      .expect(200);

    expect(response.body).toEqual(mockResult);
    expect(booksServiceMock.searchBooks).toHaveBeenCalledWith('nestjs', undefined, undefined, undefined);
  });

  it('validates required query parameter', async () => {
    const response = await request(app.getHttpServer())
      .get('/books/search')
      .query({ q: '' })
      .expect(400);

    expect(response.body.message.some((msg: string) => msg.includes('q should not be empty'))).toBe(true);
  });
});
