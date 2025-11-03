import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import { Agent as HttpsAgent } from 'https';

interface TogglTimeEntry {
  id: number;
  description: string | null;
  duration: number;
  start: string;
  stop?: string | null;
}

@Injectable()
export class TogglService {
  private readonly logger = new Logger(TogglService.name);
  private readonly baseUrl = 'https://api.track.toggl.com/api/v9';
  private readonly lookbackMonths =
    Number.isNaN(Number(process.env.TOGGL_LOOKBACK_MONTHS))
      ? 6
      : Math.max(1, Number(process.env.TOGGL_LOOKBACK_MONTHS));
  private readonly allowSelfSignedCertificates =
    process.env.ALLOW_SELF_SIGNED_CERTS !== undefined
      ? process.env.ALLOW_SELF_SIGNED_CERTS === 'true'
      : (process.env.NODE_ENV ?? 'development') !== 'production';
  private readonly httpsAgent = this.allowSelfSignedCertificates
    ? new HttpsAgent({ rejectUnauthorized: false })
    : undefined;

  async findBookHours(title: string): Promise<number> {
    const apiToken = process.env.TOGGL_API_TOKEN;
    const workspaceId = process.env.TOGGL_WORKSPACE_ID;
    const projectId = process.env.TOGGL_PROJECT_ID;

    if (!apiToken || !workspaceId) {
      this.logger.error('Toggl credentials are not configured (TOGGL_API_TOKEN / TOGGL_WORKSPACE_ID).');
      throw new InternalServerErrorException(
        'Integração com Toggl Track não configurada. Verifique as variáveis TOGGL_API_TOKEN e TOGGL_WORKSPACE_ID.',
      );
    }

    const authorization = `Basic ${Buffer.from(`${apiToken}:api_token`).toString('base64')}`;
    const now = new Date();
    const startDate = new Date(now);
    startDate.setMonth(now.getMonth() - this.lookbackMonths);

    const params: Record<string, string> = {
      start_date: startDate.toISOString(),
      end_date: now.toISOString(),
      workspace_id: workspaceId,
    };

    if (projectId) {
      params.project_ids = projectId;
    }

    const normalizedTitle = title.trim().toLowerCase();
    let totalSeconds = 0;

    try {
      const response = await axios.get<TogglTimeEntry[]>(
        `${this.baseUrl}/me/time_entries`,
        {
          headers: {
            Authorization: authorization,
          },
          params,
          httpsAgent: this.httpsAgent,
          timeout: 10000,
        },
      );

      const entries = Array.isArray(response.data) ? response.data : [];
      const currentTimestampInSeconds = Math.floor(Date.now() / 1000);

      entries.forEach((entry) => {
        if (!entry.description) {
          return;
        }

        if (entry.description.toLowerCase().includes(normalizedTitle)) {
          const durationSeconds =
            entry.duration >= 0
              ? entry.duration
              : Math.max(0, currentTimestampInSeconds + entry.duration);

          totalSeconds += durationSeconds;
        }
      });
    } catch (error) {
      this.logger.error(
        `Failed to retrieve Toggl Track entries for title "${title}"`,
        error instanceof Error ? error.stack : undefined,
      );

      if (error instanceof AxiosError) {
        if (error.response?.status === 401) {
          throw new UnauthorizedException('Credenciais do Toggl Track inválidas.');
        }

        if (error.response?.status === 429) {
          throw new InternalServerErrorException(
            'Limite de requisições do Toggl Track atingido. Tente novamente em instantes.',
          );
        }

        if (error.response?.status === 404) {
          throw new InternalServerErrorException('Workspace do Toggl Track não encontrado.');
        }
      }

      if (
        error instanceof AxiosError &&
        (error.code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
          error.code === 'SELF_SIGNED_CERT_IN_CHAIN' ||
          (typeof error.message === 'string' && error.message.includes('self-signed certificate')))
      ) {
        const reason =
          error.response?.data && typeof error.response.data === 'string'
            ? `Detalhes: ${error.response.data}`
            : '';
        throw new InternalServerErrorException(
          `Falha na validação SSL ao consultar o Toggl Track. `
          + 'Se estiver atrás de um proxy corporativo, defina ALLOW_SELF_SIGNED_CERTS=true ou instale o certificado.'
          + (reason ? ` ${reason}` : ''),
        );
      }

      if (error instanceof AxiosError && error.response?.status === 400) {
        const details =
          typeof error.response.data === 'string'
            ? error.response.data
            : JSON.stringify(error.response.data ?? {});

        throw new InternalServerErrorException(
          `Consulta inválida ao Toggl Track (400). Verifique os parâmetros informados. Detalhes: ${details}`,
        );
      }

      throw new InternalServerErrorException('Não foi possível consultar o Toggl Track.');
    }

    const hours = Math.round((totalSeconds / 3600) * 100) / 100;
    return Number.isFinite(hours) ? hours : 0;
  }
}
