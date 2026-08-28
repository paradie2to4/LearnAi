import { ServiceUnavailableException } from '@nestjs/common';

/**
 * Thrown by AnthropicProvider when ANTHROPIC_API_KEY is not configured, so the
 * app can boot and the rest of the platform stays fully testable without a
 * live key. Controllers let this bubble up as a 503; internal callers (e.g.
 * RecommendationService reacting to an event) should catch it and degrade
 * gracefully (e.g. skip narrative generation) rather than crash a consumer.
 */
export class AiUnavailableException extends ServiceUnavailableException {
  constructor() {
    super('AI features are not configured on this server (missing ANTHROPIC_API_KEY)');
  }
}
