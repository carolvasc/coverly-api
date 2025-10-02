import { Injectable, Logger, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AxiosError, AxiosResponse, isAxiosError } from 'axios';
import { Agent as HttpsAgent, AgentOptions as HttpsAgentOptions } from 'https';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { lastValueFrom } from 'rxjs';
import { BookDto, BookSearchResponseDto } from './dto/book.dto';

interface GoogleBooksImageLinks {
  smallThumbnail?: string;
  thumbnail?: string;
}

interface GoogleBooksVolumeInfo {
  title?: string;
  authors?: string[];
  publisher?: string;
  publishedDate?: string;
  pageCount?: number;
  description?: string;
  imageLinks?: GoogleBooksImageLinks;
}

interface GoogleBooksVolume {
  id: string;
  volumeInfo: GoogleBooksVolumeInfo;
}

interface GoogleBooksResponse {
  totalItems?: number;
  items?: GoogleBooksVolume[];
}

interface CachedResult {
  timestamp: number;
  data: BookSearchResponseDto;
}

@Injectable()
export class BooksService {
  private readonly logger = new Logger(BooksService.name);
  private readonly googleBooksApiUrl: string;
  private readonly cache = new Map<string, CachedResult>();
  private readonly cacheTtlMs = 60_000;
  private readonly maxResultsCap = 40;
  private readonly httpsAgent?: HttpsAgent;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.googleBooksApiUrl = this.configService.get<string>(
      'GOOGLE_BOOKS_API_URL',
      'https://www.googleapis.com/books/v1/volumes',
    );

    this.httpsAgent = this.buildHttpsAgent();
  }

  async searchBooks(
    query: string,
    orderBy: 'relevance' | 'newest' = 'relevance',
    startIndex = 0,
    maxResults = 10,
  ): Promise<BookSearchResponseDto> {
    const cappedMaxResults = Math.min(maxResults, this.maxResultsCap);
    const cacheKey = this.buildCacheKey(query, orderBy, startIndex, cappedMaxResults);
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheTtlMs) {
      this.logger.debug(`Cache hit for ${cacheKey}`);
      return cached.data;
    }

    this.logger.log(
      `Searching books with query="${query}", orderBy=${orderBy}, startIndex=${startIndex}, maxResults=${cappedMaxResults}`,
    );

    try {
      const response = await this.fetchWithRetries(query, orderBy, startIndex, cappedMaxResults);
      const result = this.mapResponse(response.data);

      this.cache.set(cacheKey, { timestamp: Date.now(), data: result });
      this.logger.log(`Found ${result.items.length} books`);

      return result;
    } catch (error) {
      this.handleError(error);
    }
  }

  private async fetchWithRetries(
    query: string,
    orderBy: 'relevance' | 'newest',
    startIndex: number,
    maxResults: number,
  ): Promise<AxiosResponse<GoogleBooksResponse>> {
    const maxAttempts = 3;
    let attempt = 0;
    let delayMs = 500;

    while (attempt < maxAttempts) {
      attempt += 1;
      try {
        return await lastValueFrom(
          this.httpService.get<GoogleBooksResponse>(this.googleBooksApiUrl, {
            params: { q: query, orderBy, startIndex, maxResults },
            timeout: 5000,
            httpsAgent: this.httpsAgent,
          }),
        );
      } catch (error) {
        if (attempt >= maxAttempts || !this.shouldRetry(error)) {
          throw error;
        }

        this.logger.warn(
          `Search attempt ${attempt} failed (${this.describeAxiosError(error as AxiosError)}). Retrying in ${delayMs}ms...`,
        );
        await this.delay(delayMs);
        delayMs *= 2;
      }
    }

    throw new InternalServerErrorException('Failed to search books');
  }

  private shouldRetry(error: unknown): boolean {
    if (!isAxiosError(error)) {
      return false;
    }

    const status = error.response?.status;
    return (
      status === 429 ||
      status === 503 ||
      error.code === 'ECONNABORTED' ||
      error.code === 'ERR_NETWORK'
    );
  }

  private mapResponse(data: GoogleBooksResponse): BookSearchResponseDto {
    const volumes = data.items ?? [];

    const items: BookDto[] = volumes.map((item) => {
      const info = item.volumeInfo ?? {};
      return {
        id: item.id,
        title: info.title ?? 'Unknown Title',
        authors: info.authors ?? ['Unknown Author'],
        publisher: info.publisher ?? 'Unknown Publisher',
        publishedDate: info.publishedDate ?? 'Unknown',
        pageCount: info.pageCount ?? 0,
        description: info.description,
        thumbnail: info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail,
      };
    });

    return {
      totalItems: data.totalItems ?? items.length,
      items,
    };
  }

  private handleError(error: unknown): never {
    if (isAxiosError(error)) {
      const status = error.response?.status;
      const message = this.describeAxiosError(error);

      if (status && status >= 400 && status < 500 && status !== 429) {
        this.logger.warn(`Google Books client error (${status}): ${message}`);
        throw new BadRequestException(`Google Books API error (${status})`);
      }

      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Google Books request failed: ${message}`, stack);

      if (status === 429) {
        throw new InternalServerErrorException('Too many requests to Google Books API');
      }
      if (status && status >= 500) {
        throw new InternalServerErrorException('Google Books service is unavailable');
      }
      if (error.code === 'ECONNABORTED') {
        throw new InternalServerErrorException('Request to Google Books timed out');
      }
      if (error.code === 'ERR_NETWORK') {
        throw new InternalServerErrorException('Unable to reach Google Books service');
      }
      if (this.isCertValidationError(error.code)) {
        throw new InternalServerErrorException(
          'SSL certificate validation failed for Google Books API. Provide a trusted CA bundle via GOOGLE_BOOKS_CA_FILE/GOOGLE_BOOKS_CA_CERT or disable validation (GOOGLE_BOOKS_REJECT_UNAUTHORIZED=false) in development environments.',
        );
      }
    } else if (error instanceof Error) {
      this.logger.error('Failed to search books', error.stack);
    } else {
      this.logger.error(`Failed to search books: ${JSON.stringify(error)}`);
    }

    throw new InternalServerErrorException('Failed to search books');
  }

  private normalizeBoolean(value: unknown): boolean | undefined {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['true', '1', 'yes', 'on'].includes(normalized)) {
        return true;
      }
      if (['false', '0', 'no', 'off'].includes(normalized)) {
        return false;
      }
    }

    return undefined;
  }

  private describeAxiosError(error: AxiosError): string {
    if (error.response) {
      const statusText = error.response.statusText ? ` ${error.response.statusText}` : '';
      return `${error.response.status}${statusText}`.trim();
    }
    if (error.code) {
      return error.code;
    }
    return error.message;
  }

  private buildCacheKey(
    query: string,
    orderBy: string,
    startIndex: number,
    maxResults: number,
  ): string {
    return JSON.stringify({ query, orderBy, startIndex, maxResults });
  }

  private buildHttpsAgent(): HttpsAgent | undefined {
    const rejectUnauthorizedConfig = this.configService.get<string | boolean>(
      'GOOGLE_BOOKS_REJECT_UNAUTHORIZED',
    );
    const shouldRejectUnauthorized = this.normalizeBoolean(rejectUnauthorizedConfig);

    const caFile = this.configService.get<string>('GOOGLE_BOOKS_CA_FILE');
    const inlineCa = this.configService.get<string>('GOOGLE_BOOKS_CA_CERT');

    const agentOptions: HttpsAgentOptions = {};

    if (shouldRejectUnauthorized !== undefined) {
      agentOptions.rejectUnauthorized = shouldRejectUnauthorized;
    }

    const caBundle = this.loadCertificateBundle(caFile, inlineCa);
    if (caBundle) {
      agentOptions.ca = caBundle;
    }

    if ('rejectUnauthorized' in agentOptions && agentOptions.rejectUnauthorized === false) {
      this.logger.warn(
        'GOOGLE_BOOKS_REJECT_UNAUTHORIZED is set to false. SSL certificate validation is disabled for Google Books requests. Use only in development environments.',
      );
    }

    if (caBundle || agentOptions.rejectUnauthorized === false) {
      return new HttpsAgent(agentOptions);
    }

    return undefined;
  }

  private loadCertificateBundle(caFile?: string, inlineCa?: string): string | Buffer | Array<string | Buffer> | undefined {
    try {
      if (inlineCa && inlineCa.trim()) {
        return this.parseCertificate(inlineCa.trim());
      }

      if (caFile && caFile.trim()) {
        const resolvedPath = resolve(process.cwd(), caFile.trim());
        return readFileSync(resolvedPath);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : JSON.stringify(error);
      this.logger.error(`Failed to load Google Books CA bundle: ${message}`);
    }

    return undefined;
  }

  private parseCertificate(cert: string): string | Buffer | Array<string | Buffer> {
    const pemHeader = '-----BEGIN CERTIFICATE-----';
    const pemFooter = '-----END CERTIFICATE-----';

    if (cert.includes(pemHeader) && cert.includes(pemFooter)) {
      return cert;
    }

    return Buffer.from(cert, 'base64');
  }

  private isCertValidationError(code?: string): boolean {
    if (!code) {
      return false;
    }

    return [
      'SELF_SIGNED_CERT_IN_CHAIN',
      'DEPTH_ZERO_SELF_SIGNED_CERT',
      'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
      'CERT_HAS_EXPIRED',
    ].includes(code);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
