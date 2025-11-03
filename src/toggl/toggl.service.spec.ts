import { InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { TogglService } from './toggl.service';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

const buildAxiosError = (status: number): AxiosError => {
  const config = {
    headers: {},
    method: 'get',
    url: '',
  } as InternalAxiosRequestConfig;

  return new AxiosError('error', undefined, config, undefined, {
    status,
    statusText: '',
    headers: {},
    config,
    data: {},
  });
};

describe('TogglService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    process.env = { ...originalEnv };
    process.env.TOGGL_API_TOKEN = 'token';
    process.env.TOGGL_WORKSPACE_ID = '123';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = originalEnv;
  });

  it('aggregates tracked hours for descriptions matching the book title (case insensitive)', async () => {
    const runningEntryStartSeconds = Math.floor(Date.now() / 1000) - 1800;

    mockedAxios.get.mockResolvedValueOnce({
      data: [
        { description: 'O Hobbit', duration: 3600 },
        { description: 'o hobbit - parte 2', duration: -runningEntryStartSeconds },
        { description: 'Outro livro', duration: 7200 },
      ],
    } as any);

    const service = new TogglService();
    const hours = await service.findBookHours('O HOBBIT');

    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    expect(hours).toBeCloseTo(1.5, 5);
  });

  it('throws when Toggl credentials are missing', async () => {
    delete process.env.TOGGL_API_TOKEN;

    const service = new TogglService();

    await expect(service.findBookHours('qualquer')).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it('maps unauthorized responses to UnauthorizedException', async () => {
    mockedAxios.get.mockRejectedValueOnce(buildAxiosError(401));

    const service = new TogglService();

    await expect(service.findBookHours('algum livro')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
