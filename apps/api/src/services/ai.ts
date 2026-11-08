/**
 * Un modèle de langage, appelé côté serveur — jamais depuis le navigateur.
 *
 * Un seul point d'entrée pour tout ce qui demandera de l'IA dans CeedFlow (la
 * Knowledge Base d'abord, puis l'extraction de bailleurs ou de tâches) : on
 * lui donne une consigne et un texte, il rend du JSON. Le fournisseur et le
 * modèle se choisissent dans les réglages ; les clés restent dans les
 * variables d'environnement.
 */
import { HttpError } from '../routes/util.js';

export type AiProvider = 'anthropic' | 'openai';

export const aiKeys = () => ({
  anthropic: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
  openai: Boolean(process.env.OPENAI_API_KEY?.trim()),
});

/** Le premier objet JSON d'une réponse — un modèle l'entoure parfois de phrases. */
export function jsonIn(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('The model did not answer in JSON.');
  return JSON.parse(text.slice(start, end + 1));
}

/**
 * Une consigne, un texte, une réponse JSON. Une erreur dit ce qui s'est passé
 * — clé absente, refus du fournisseur, délai dépassé — pour être montrée telle
 * quelle à qui a lancé l'analyse.
 */
export async function askJson(
  provider: AiProvider,
  model: string,
  system: string,
  user: string,
  /** Un schéma JSON : OpenAI s'y tient strictement ; le résultat est revalidé de toute façon. */
  opts: { maxTokens?: number; timeoutMs?: number; schema?: { name: string; schema: object } } = {},
): Promise<unknown> {
  /* Large : un modèle qui raisonne compte sa réflexion dans cette limite, et une
     limite trop courte le laisse sans place pour répondre. On ne paie que l'usage. */
  const maxTokens = opts.maxTokens ?? 16_000;
  const signal = AbortSignal.timeout(opts.timeoutMs ?? 120_000);
  if (!model.trim()) throw new HttpError(422, 'No model is set — choose one in Settings → Knowledge Base.');

  if (provider === 'anthropic') {
    const key = process.env.ANTHROPIC_API_KEY?.trim();
    if (!key) throw new HttpError(422, 'ANTHROPIC_API_KEY is not set on the server.');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
    });
    const data = (await res.json().catch(() => ({}))) as { content?: { type: string; text?: string }[]; error?: { message?: string } };
    if (!res.ok) throw new Error(`Anthropic answered ${res.status}: ${data.error?.message ?? 'no detail'}`);
    return jsonIn((data.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join(''));
  }

  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new HttpError(422, 'OPENAI_API_KEY is not set on the server.');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      max_completion_tokens: maxTokens,
      response_format: opts.schema
        ? { type: 'json_schema', json_schema: { name: opts.schema.name, strict: true, schema: opts.schema.schema } }
        : { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    choices?: { message?: { content?: string }; finish_reason?: string }[];
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(`OpenAI answered ${res.status}: ${data.error?.message ?? 'no detail'}`);
  const choice = data.choices?.[0];
  if (!choice?.message?.content?.trim()) {
    throw new Error(
      choice?.finish_reason === 'length'
        ? 'The model used its whole answer budget before answering — run it again, or choose another model.'
        : 'The model returned an empty answer — run it again.',
    );
  }
  return jsonIn(choice.message.content);
}
