import { describe, expect, it } from 'vitest';
import { modelChain, modelFromSpec, openRouterModel, type Model } from './llm.js';

function fakeFetch(responses: { status: number; body: unknown }[]) {
  const requests: { url: string; body: any; headers: Record<string, string> }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    requests.push({ url, body: JSON.parse(init.body as string), headers: init.headers as Record<string, string> });
    const r = responses.shift()!;
    return new Response(JSON.stringify(r.body), { status: r.status });
  }) as unknown as typeof fetch;
  return { impl, requests };
}

const fake = (name: string, behaviour: string | Error): Model => ({
  name,
  generateJson: async () => {
    if (behaviour instanceof Error) throw behaviour;
    return behaviour;
  },
  generateText: async () => {
    if (behaviour instanceof Error) throw behaviour;
    return behaviour;
  },
});

describe('openRouterModel', () => {
  it('requests strict structured output and returns the message content', async () => {
    const { impl, requests } = fakeFetch([{ status: 200, body: { choices: [{ message: { content: '{"days":[]}' } }] } }]);
    const model = openRouterModel('key-123', 'google/gemma-4-31b-it:free', impl);
    const schema = { type: 'object' };

    expect(await model.generateJson('plan please', schema)).toBe('{"days":[]}');
    expect(requests[0].url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(requests[0].headers.Authorization).toBe('Bearer key-123');
    expect(requests[0].body).toMatchObject({
      model: 'google/gemma-4-31b-it:free',
      messages: [{ role: 'user', content: 'plan please' }],
      response_format: { type: 'json_schema', json_schema: { strict: true, schema } },
      provider: { require_parameters: true },
    });
  });

  it('throws on HTTP errors and on errors reported inside a 200 response', async () => {
    const { impl } = fakeFetch([
      { status: 429, body: { error: { code: 429, message: 'Rate limit exceeded: free-models-per-day' } } },
      { status: 200, body: { error: { code: 502, message: 'Provider returned error' } } },
    ]);
    const model = openRouterModel('k', 'm', impl);
    await expect(model.generateText('x')).rejects.toThrow(/429 Rate limit/);
    await expect(model.generateText('x')).rejects.toThrow(/502 Provider returned error/);
  });
});

describe('modelChain', () => {
  it('falls through to the next model and reports which one answered', async () => {
    const chain = modelChain([fake('free-a', new Error('429')), fake('free-b', new Error('503')), fake('gemini', 'ok')]);
    expect(await chain.generateJson('p', {})).toBe('ok');
    expect(chain.lastServedBy).toBe('gemini');
    expect(chain.name).toBe('gemini');
  });

  it('uses the first model when it works', async () => {
    const chain = modelChain([fake('free-a', 'first'), fake('gemini', 'second')]);
    expect(await chain.generateText('p')).toBe('first');
    expect(chain.lastServedBy).toBe('free-a');
  });

  it('moves on when a model is too slow', async () => {
    const hang: Model = { name: 'slow-free', generateJson: () => new Promise(() => {}), generateText: () => new Promise(() => {}) };
    const chain = modelChain([hang, fake('gemini', 'fast')], { timeoutMs: 20 });
    expect(await chain.generateJson('p', {})).toBe('fast');
    expect(chain.lastServedBy).toBe('gemini');
  });

  it('reports every failure when all models fail', async () => {
    const chain = modelChain([fake('a', new Error('429 limit')), fake('b', new Error('down'))]);
    await expect(chain.generateJson('p', {})).rejects.toThrow(/a: 429 limit \| b: down/);
  });
});

describe('modelFromSpec', () => {
  it('skips providers without a key and rejects unknown providers', () => {
    expect(modelFromSpec('openrouter:qwen/qwen3.8-27b:free', {})).toBeNull();
    expect(modelFromSpec('openrouter:qwen/qwen3.8-27b:free', { openrouter: 'k' })?.name).toBe('openrouter:qwen/qwen3.8-27b:free');
    expect(() => modelFromSpec('azure:gpt', {})).toThrow(/Unknown model provider/);
  });
});
