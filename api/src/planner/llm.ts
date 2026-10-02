import { GoogleGenAI } from '@google/genai';

export const DEFAULT_MODEL = 'gemini-2.5-flash';

/** The one thing the planner needs from a model: JSON text that follows a schema. */
export interface JsonModel {
  readonly name: string;
  generateJson(prompt: string, schema: object): Promise<string>;
}

/** Free-text generation (the Recipe Generator's markdown recipe). */
export interface TextModel {
  readonly name: string;
  generateText(prompt: string): Promise<string>;
}

export type Model = JsonModel & TextModel;

// ---------------------------------------------------------------------------
// Google (Gemini API directly)
// ---------------------------------------------------------------------------

export function geminiModel(apiKey: string, model = DEFAULT_MODEL): Model {
  const ai = new GoogleGenAI({ apiKey });
  return {
    name: `google:${model}`,
    async generateJson(prompt, schema) {
      const res = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { responseMimeType: 'application/json', responseJsonSchema: schema },
      });
      return res.text ?? '';
    },
    async generateText(prompt) {
      const res = await ai.models.generateContent({ model, contents: prompt });
      return res.text ?? '';
    },
  };
}

// ---------------------------------------------------------------------------
// OpenRouter (OpenAI-compatible; free and paid models)
// ---------------------------------------------------------------------------

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export function openRouterModel(apiKey: string, model: string, fetchImpl: typeof fetch = fetch): Model {
  async function complete(body: object): Promise<string> {
    const res = await fetchImpl(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Title': 'MealMind',
      },
      body: JSON.stringify({ model, ...body }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      choices?: { message?: { content?: string } }[];
      error?: { message?: string; code?: number };
    };
    // OpenRouter can report errors with HTTP 200 and an `error` body, so check both.
    if (!res.ok || json.error) {
      throw new Error(`${json.error?.code ?? res.status} ${json.error?.message ?? res.statusText} (openrouter:${model})`);
    }
    return json.choices?.[0]?.message?.content ?? '';
  }

  return {
    name: `openrouter:${model}`,
    generateJson: (prompt, schema) =>
      complete({
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_schema', json_schema: { name: 'meal_plan', strict: true, schema } },
        provider: { require_parameters: true }, // only route to providers that support structured output
      }),
    generateText: (prompt) => complete({ messages: [{ role: 'user', content: prompt }] }),
  };
}

// ---------------------------------------------------------------------------
// Fallback chain: try models in order (e.g. free first, paid last)
// ---------------------------------------------------------------------------

export type ChainModel = Model & { readonly lastServedBy: string | null };

/**
 * Tries each model in turn and returns the first answer. Any error (rate limit,
 * outage, unsupported option) moves on to the next model. `name` reports the
 * model that actually answered most recently, so saved plans record it.
 */
export function modelChain(models: Model[]): ChainModel {
  if (!models.length) throw new Error('modelChain needs at least one model');
  let lastServedBy: string | null = null;

  async function run(call: (m: Model) => Promise<string>): Promise<string> {
    const errors: string[] = [];
    for (const m of models) {
      try {
        const out = await call(m);
        lastServedBy = m.name;
        return out;
      } catch (err) {
        errors.push(`${m.name}: ${(err as Error).message ?? err}`);
      }
    }
    throw new Error(`All models failed. ${errors.join(' | ')}`);
  }

  return {
    get name() {
      return lastServedBy ?? models.map((m) => m.name).join(' > ');
    },
    get lastServedBy() {
      return lastServedBy;
    },
    generateJson: (prompt, schema) => run((m) => m.generateJson(prompt, schema)),
    generateText: (prompt) => run((m) => m.generateText(prompt)),
  };
}

/**
 * Builds a model from a spec like "openrouter:google/gemma-4-31b-it:free" or
 * "google:gemini-2.5-flash". Returns null if the provider's key is missing.
 */
export function modelFromSpec(spec: string, keys: { google?: string; openrouter?: string }): Model | null {
  const i = spec.indexOf(':');
  const provider = spec.slice(0, i);
  const id = spec.slice(i + 1);
  if (provider === 'google') return keys.google ? geminiModel(keys.google, id) : null;
  if (provider === 'openrouter') return keys.openrouter ? openRouterModel(keys.openrouter, id) : null;
  throw new Error(`Unknown model provider in "${spec}" (use google: or openrouter:)`);
}

/** Free models first, then Gemini on the Google free tier, then paid Gemini via OpenRouter. */
export const DEFAULT_MODEL_CHAIN = [
  'openrouter:google/gemma-4-31b-it:free',
  'openrouter:qwen/qwen3.8-27b:free',
  'openrouter:nvidia/nemotron-3-super-120b-a12b:free',
  'google:gemini-2.5-flash',
  'openrouter:google/gemini-2.5-flash',
];
