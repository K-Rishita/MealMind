import { GoogleGenAI } from '@google/genai';

export const DEFAULT_MODEL = 'gemini-2.5-flash';

/** The one thing the planner needs from a model: JSON text that follows a schema. */
export interface JsonModel {
  readonly name: string;
  generateJson(prompt: string, schema: object): Promise<string>;
}

export function geminiModel(apiKey: string, model = DEFAULT_MODEL): JsonModel {
  const ai = new GoogleGenAI({ apiKey });
  return {
    name: model,
    async generateJson(prompt, schema) {
      const res = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { responseMimeType: 'application/json', responseJsonSchema: schema },
      });
      return res.text ?? '';
    },
  };
}

/** Free-text generation (the Recipe Generator's markdown recipe). */
export interface TextModel {
  readonly name: string;
  generateText(prompt: string): Promise<string>;
}

export function geminiTextModel(apiKey: string, model = DEFAULT_MODEL): TextModel {
  const ai = new GoogleGenAI({ apiKey });
  return {
    name: model,
    async generateText(prompt) {
      const res = await ai.models.generateContent({ model, contents: prompt });
      return res.text ?? '';
    },
  };
}
