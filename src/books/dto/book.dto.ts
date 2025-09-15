export class BookDto {
  id: string;
  title: string;
  authors: string[];
  publisher: string;
  publishedDate: string;
  pageCount: number;
  description?: string;
  thumbnail?: string;
}

export class BookSearchResponseDto {
  totalItems: number;
  items: BookDto[];
}