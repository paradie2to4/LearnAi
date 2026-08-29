import { HttpException, ServiceUnavailableException } from '@nestjs/common';

/**
 * Wraps a call into an AiProvider method so any failure reaches the client as a
 * diagnosable 503 instead of an opaque 500. AiUnavailableException (no API key
 * configured) is already an HttpException with its own clear message and is
 * rethrown unchanged; anything else (a raw Error from the provider - invalid API
 * key, bad/deprecated model id, quota exceeded, network error) is converted to a
 * ServiceUnavailableException carrying that message, so the real cause is visible
 * in the HTTP response itself rather than only in server logs.
 */
export async function wrapAiCall<T>(fn: () => Promise<T>, fallbackMessage: string): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof HttpException) {
      throw error;
    }
    throw new ServiceUnavailableException(error instanceof Error ? error.message : fallbackMessage);
  }
}
