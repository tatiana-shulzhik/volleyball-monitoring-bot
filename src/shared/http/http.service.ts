import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { Agent } from 'https';
import {
  CEV_HTTP_CONCURRENCY,
  LEGA_VOLLEY_HTTP_CONCURRENCY,
  MAX_ATTEMPTS,
} from '../consts/constants';

@Injectable()
export class HttpService {
  private readonly client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      timeout: 10000,
      httpsAgent: new Agent({
        keepAlive: true,
        maxSockets: Math.max(
          CEV_HTTP_CONCURRENCY,
          LEGA_VOLLEY_HTTP_CONCURRENCY,
        ),
        maxFreeSockets: Math.max(
          CEV_HTTP_CONCURRENCY,
          LEGA_VOLLEY_HTTP_CONCURRENCY,
        ),
      }),
      headers: {
        'User-Agent': 'CEV_MONITOR_BOT',
      },
    });
  }

  async get(url: string, timeout?: number): Promise<string> {
    return this.withRetry(async () => {
      const { data } = await this.client.get<string>(url, { timeout });
      return data;
    });
  }

  async postForm(url: string, form: URLSearchParams): Promise<string> {
    return this.withRetry(async () => {
      const { data } = await this.client.post<string>(url, form.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      return data;
    });
  }

  private async withRetry<T>(request: () => Promise<T>): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        return await request();
      } catch (error) {
        lastError = error;

        if (axios.isAxiosError(error) && error.response) {
          const status = error.response.status;

          if (
            status >= 400 &&
            status < 500 &&
            status !== 408 &&
            status !== 429
          ) {
            throw error;
          }
        }

        if (attempt < MAX_ATTEMPTS) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 500));
        }
      }
    }

    throw lastError;
  }
}
