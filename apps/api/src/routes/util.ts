import type { FastifyReply } from 'fastify';
import type { TypeOf, ZodTypeAny } from 'zod';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

/** Validates a body and turns zod issues into a 422 the form can display. */
export function parse<S extends ZodTypeAny>(schema: S, body: unknown): TypeOf<S> {
  const result = schema.safeParse(body ?? {});
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  throw new HttpError(422, 'Some fields need attention.', fields);
}

export function notFound(reply: FastifyReply, message: string): never {
  void reply;
  throw new HttpError(404, message);
}
