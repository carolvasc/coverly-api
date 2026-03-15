import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { BooksService } from './books.service';

jest.mock('axios', () => {
  const actual = jest.requireActual('axios');

  return {
    __esModule: true,
    ...actual,
    default: {
      ...actual.default,
      get: jest.fn(),
    },
  };
});

const mockedAxios = axios as jest.Mocked<typeof axios>;

const buildAxiosError = (status: number, code?: string, message = 'error'): AxiosError => {
  const config = {
    headers: {},
    method: 'get',
    url: '',
  } as InternalAxiosRequestConfig;

  return new AxiosError(message, code, config, undefined, {
    status,
    statusText: '',
    headers: {},
    config,
    data: {},
  });
};

describe('BooksService', () => {
  let service: BooksService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new BooksService();
  });

  it('maps Google Books responses into the app book shape', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        totalItems: 1,
        items: [
          {
            id: 'book-1',
            volumeInfo: {
              title: 'Dune',
              authors: ['Frank Herbert'],
              publisher: 'Ace',
              publishedDate: '1965',
              pageCount: 412,
              description: 'Epic science fiction.',
              imageLinks: { thumbnail: 'https://example.com/dune.jpg' },
              categories: ['Science Fiction'],
            },
          },
        ],
      },
    } as never);

    await expect(service.searchBooks('dune', 'newest', 3, 50)).resolves.toEqual({
      totalItems: 1,
      items: [
        {
          id: 'book-1',
          title: 'Dune',
          authors: ['Frank Herbert'],
          publisher: 'Ace',
          publishedDate: '1965',
          pageCount: 412,
          description: 'Epic science fiction.',
          thumbnail: 'https://example.com/dune.jpg',
          categories: ['Science Fiction'],
        },
      ],
    });

    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://www.googleapis.com/books/v1/volumes',
      expect.objectContaining({
        params: {
          q: 'dune',
          orderBy: 'newest',
          startIndex: 3,
          maxResults: 40,
        },
      }),
    );
  });

  it('maps timeout errors from Google Books into internal server errors', async () => {
    mockedAxios.get.mockRejectedValueOnce(buildAxiosError(500, 'ECONNABORTED'));

    await expect(service.searchBooks('dune')).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('rejects invalid cover urls before performing any request', async () => {
    await expect(service.fetchCoverImage('http://example.com/cover.jpg')).rejects.toBeInstanceOf(BadRequestException);
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it('fetches and encodes allowed cover images', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: Buffer.from('cover-bytes'),
      headers: {
        'content-type': 'image/png',
      },
    } as never);

    await expect(
      service.fetchCoverImage('https://books.google.com/books/content?id=1&printsec=frontcover'),
    ).resolves.toEqual({
      contentType: 'image/png',
      base64: Buffer.from('cover-bytes').toString('base64'),
    });
  });

  it('maps not found cover responses into bad requests', async () => {
    mockedAxios.get.mockRejectedValueOnce(buildAxiosError(404));

    await expect(
      service.fetchCoverImage('https://books.google.com/books/content?id=missing'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
