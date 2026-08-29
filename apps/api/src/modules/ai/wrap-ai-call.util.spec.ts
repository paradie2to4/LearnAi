import { ServiceUnavailableException } from '@nestjs/common';
import { AiUnavailableException } from './ai-unavailable.exception';
import { wrapAiCall } from './wrap-ai-call.util';

describe('wrapAiCall', () => {
  it('returns the resolved value on success', async () => {
    const result = await wrapAiCall(() => Promise.resolve('answer'), 'fallback');
    expect(result).toBe('answer');
  });

  it('rethrows an AiUnavailableException unchanged (already a clear HttpException)', async () => {
    await expect(
      wrapAiCall(() => Promise.reject(new AiUnavailableException()), 'fallback'),
    ).rejects.toBeInstanceOf(AiUnavailableException);
  });

  it('wraps a raw Error as a ServiceUnavailableException carrying its message', async () => {
    await expect(
      wrapAiCall(() => Promise.reject(new Error('API key not valid')), 'fallback'),
    ).rejects.toMatchObject({
      message: 'API key not valid',
    });
    await expect(
      wrapAiCall(() => Promise.reject(new Error('API key not valid')), 'fallback'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('uses the fallback message when the rejection is not an Error instance', async () => {
    await expect(
      wrapAiCall(() => Promise.reject('a plain string'), 'fallback message'),
    ).rejects.toMatchObject({
      message: 'fallback message',
    });
  });
});
