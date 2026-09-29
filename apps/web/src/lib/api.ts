export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fields: Record<string, string> | null = null,
  ) {
    super(message);
  }
}

/**
 * What to say when the server did not send a message of its own.
 *
 * The status is always in it. A juror reading a red box during a jury day
 * cannot do much with "Something went wrong", but "(HTTP 403)" is the one
 * thing that lets somebody else find the cause in a minute.
 */
function fallback(status: number): string {
  if (status === 401) return 'Your session has ended. Sign in again.';
  if (status === 403) return 'That is not allowed any more — reload the page and try again. (HTTP 403)';
  if (status === 404) return 'That is not there any more. (HTTP 404)';
  if (status >= 500) return `Something went wrong on our side. (HTTP ${status})`;
  return `The request was refused. (HTTP ${status})`;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;

  const text = await res.text();
  /* Parsing used to happen before the status was looked at, so anything that
     answered with something other than JSON — a proxy's redirect page, an
     error page from in front of the API — threw the parser's own complaint
     and threw the real status away with it. What reached the screen was
     "Unexpected token '<'", which says nothing to anybody. */
  type Body = { error?: string; fields?: Record<string, string> | null };
  let payload: Body | null = null;
  try {
    payload = text ? (JSON.parse(text) as Body) : null;
  } catch {
    payload = null;
  }

  if (!res.ok) throw new ApiError(res.status, payload?.error ?? fallback(res.status), payload?.fields ?? null);

  // A success that is not JSON is a wrong answer too — usually the index page
  // served where the API should have been — and saying so beats a page that
  // renders half-empty with no explanation.
  if (text && payload === null) {
    throw new ApiError(res.status, 'The server sent something this page could not read.');
  }
  return payload as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  del: (path: string) => request<void>('DELETE', path),
};
