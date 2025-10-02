import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { AxiosError, AxiosResponse } from 'axios';
import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { Agent as HttpsAgent } from 'https';
import { readFileSync } from 'fs';
import { BooksService } from './books.service';

jest.mock('fs', () => ({
  readFileSync: jest.fn(),
}));

describe('BooksService', () => {
  const createModule = async (options?: {
    rejectUnauthorized?: unknown;
    caFile?: string;
    caCert?: string;
  }) => {
    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'GOOGLE_BOOKS_API_URL') {
          return 'http://example.com';
        }
        if (key === 'GOOGLE_BOOKS_REJECT_UNAUTHORIZED') {
          return options?.rejectUnauthorized;
        }
        if (key === 'GOOGLE_BOOKS_CA_FILE') {
          return options?.caFile;
        }
        if (key === 'GOOGLE_BOOKS_CA_CERT') {
          return options?.caCert;
        }
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BooksService,
        {
          provide: HttpService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: configService,
        },
      ],
    }).compile();

    const service = module.get(BooksService);
    const httpService = module.get(HttpService) as jest.Mocked<HttpService>;

    return { service, httpService, configService };
  };

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('maps Google Books response to BookSearchResponseDto', async () => {
    const { service, httpService } = await createModule();

    const googleResponse: AxiosResponse = {
      data: {
        totalItems: 1,
        items: [
          {
            id: '1',
            volumeInfo: {
              title: 'Clean Code',
              authors: ['Robert C. Martin'],
              publisher: 'Prentice Hall',
              publishedDate: '2008',
              pageCount: 464,
              description: 'A Handbook of Agile Software Craftsmanship',
              imageLinks: {
                thumbnail: 'thumb.jpg',
              },
            },
          },
        ],
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: { headers: {} } as any,
    };

    httpService.get.mockReturnValue(of(googleResponse));

    const result = await service.searchBooks('clean code');

    expect(result).toEqual({
      totalItems: 1,
      items: [
        {
          id: '1',
          title: 'Clean Code',
          authors: ['Robert C. Martin'],
          publisher: 'Prentice Hall',
          publishedDate: '2008',
          pageCount: 464,
          description: 'A Handbook of Agile Software Craftsmanship',
          thumbnail: 'thumb.jpg',
        },
      ],
    });
  });

  it('reuses cached responses for identical queries', async () => {
    const { service, httpService } = await createModule();

    const response: AxiosResponse = {
      data: {
        totalItems: 0,
        items: [],
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: { headers: {} } as any,
    };

    httpService.get.mockReturnValue(of(response));

    await service.searchBooks('domain-driven design');
    await service.searchBooks('domain-driven design');

    expect(httpService.get).toHaveBeenCalledTimes(1);
  });

  it('retries on throttling and eventually succeeds', async () => {
    const { service, httpService } = await createModule();

    const throttledError = Object.assign(new Error('Too many requests'), {
      isAxiosError: true,
      response: {
        status: 429,
        statusText: 'Too Many Requests',
        headers: {},
        config: { headers: {} } as any,
        data: {},
      },
      code: 'ERR_BAD_RESPONSE',
    }) as AxiosError;

    const successResponse: AxiosResponse = {
      data: {
        totalItems: 1,
        items: [
          {
            id: '2',
            volumeInfo: {
              title: 'Refactoring',
            },
          },
        ],
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: { headers: {} } as any,
    };

    jest
      .spyOn(service as unknown as { delay(ms: number): Promise<void> }, 'delay')
      .mockResolvedValue(undefined);

    httpService.get
      .mockReturnValueOnce(throwError(() => throttledError))
      .mockReturnValueOnce(throwError(() => throttledError))
      .mockReturnValueOnce(of(successResponse));

    const result = await service.searchBooks('refactoring');

    expect(httpService.get).toHaveBeenCalledTimes(3);
    expect(result.items[0].id).toBe('2');
  });

  it('translates upstream 4xx errors into BadRequestException', async () => {
    const { service, httpService } = await createModule();

    const notFoundError = Object.assign(new Error('Not Found'), {
      isAxiosError: true,
      response: {
        status: 404,
        statusText: 'Not Found',
        headers: {},
        config: { headers: {} } as any,
        data: {},
      },
      code: 'ERR_BAD_REQUEST',
    }) as AxiosError;

    httpService.get.mockReturnValueOnce(throwError(() => notFoundError));

    await expect(service.searchBooks('missing book')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('disables SSL verification when configured', async () => {
    const { service, httpService } = await createModule({ rejectUnauthorized: 'false' });

    const response: AxiosResponse = {
      data: { totalItems: 0, items: [] },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: { headers: {} } as any,
    };

    httpService.get.mockReturnValue(of(response));

    await service.searchBooks('clean architecture');

    const requestConfig = httpService.get.mock.calls[0][1];
    expect(requestConfig?.httpsAgent).toBeInstanceOf(HttpsAgent);
    expect((requestConfig?.httpsAgent as HttpsAgent).options.rejectUnauthorized).toBe(false);
  });

  it('loads CA bundle from file when configured', async () => {
    const mockCert = 'cert from file';
    (readFileSync as jest.MockedFunction<typeof readFileSync>).mockReturnValue(mockCert);

    const { service, httpService } = await createModule({ caFile: 'certs/ca.pem' });

    const response: AxiosResponse = {
      data: { totalItems: 0, items: [] },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: { headers: {} } as any,
    };

    httpService.get.mockReturnValue(of(response));

    await service.searchBooks('secure search');

    const requestConfig = httpService.get.mock.calls[0][1];
    expect(requestConfig?.httpsAgent).toBeInstanceOf(HttpsAgent);
    expect((requestConfig?.httpsAgent as HttpsAgent).options.ca).toBe(mockCert);
  });

  it('loads CA bundle from inline certificate when configured', async () => {
    const inlineCert = '-----BEGIN CERTIFICATE-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A\n-----END CERTIFICATE-----';

    const { service, httpService } = await createModule({ caCert: inlineCert });

    const response: AxiosResponse = {
      data: { totalItems: 0, items: [] },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: { headers: {} } as any,
    };

    httpService.get.mockReturnValue(of(response));

    await service.searchBooks('secure search');

    const requestConfig = httpService.get.mock.calls[0][1];
    expect(requestConfig?.httpsAgent).toBeInstanceOf(HttpsAgent);
    expect((requestConfig?.httpsAgent as HttpsAgent).options.ca).toBe(inlineCert);
  });

  it('raises helpful error when SSL validation fails', async () => {
    const { service, httpService } = await createModule();

    const sslError = Object.assign(new Error('self signed cert'), {
      isAxiosError: true,
      code: 'SELF_SIGNED_CERT_IN_CHAIN',
    }) as AxiosError;

    httpService.get.mockReturnValueOnce(throwError(() => sslError));

    await expect(service.searchBooks('ssl test')).rejects.toThrow(
      'SSL certificate validation failed for Google Books API.',
    );
  });
});
