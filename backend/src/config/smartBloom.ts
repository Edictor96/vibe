import {env} from '#root/utils/env.js';

/**
 * Config for the Smart Bloom direct path (smartBloom module).
 *
 * The direct path runs Smart Bloom without the AI server: the transcript comes
 * from the video's YouTube captions or a file the instructor uploads, and
 * segmentation and question generation call MiniMax directly. It reads the same
 * MINIMAX_* variables as the screening filter and the support assistant, so no
 * new key is needed.
 */
export const smartBloomConfig = {
  minimax: {
    apiKey: env('MINIMAX_API_KEY'),
    model:
      env('SMART_BLOOM_MINIMAX_MODEL') || env('MINIMAX_MODEL') || 'MiniMax-M3',
    url: env('MINIMAX_URL') || 'https://api.minimax.io/v1/chat/completions',
  },

  /**
   * Per-call deadline (ms). Generating a segment's questions takes far longer
   * than a screening check, and each call must still finish inside Cloud Run's
   * request timeout (300 s by default).
   */
  llmTimeoutMs: Number(env('SMART_BLOOM_LLM_TIMEOUT_MS') || '150000'),
  llmMaxRetries: Number(env('SMART_BLOOM_LLM_MAX_RETRIES') || '1'),

  /** Deadline (ms) for each request to YouTube while reading captions. */
  captionTimeoutMs: Number(env('SMART_BLOOM_CAPTION_TIMEOUT_MS') || '15000'),

  /** Caption languages to prefer, in order, before falling back to any track. */
  captionLanguages: (env('SMART_BLOOM_CAPTION_LANGUAGES') || 'en,hi')
    .split(',')
    .map(code => code.trim().toLowerCase())
    .filter(Boolean),

  /** Largest request body the direct routes accept (transcripts, curated questions). */
  maxBodySize: env('SMART_BLOOM_MAX_BODY_SIZE') || '5mb',
};
