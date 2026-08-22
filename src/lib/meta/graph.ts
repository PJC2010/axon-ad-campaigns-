// Thin Meta Graph API client. Wire calls are isolated here so the sync logic
// can be tested against fixtures, and every Graph error surfaces as a
// GraphApiError with Meta's own message.

export class GraphApiError extends Error {
  code: number | null;
  type: string | null;

  constructor(message: string, code: number | null, type: string | null) {
    super(message);
    this.code = code;
    this.type = type;
  }

  get isAuthError(): boolean {
    return this.code === 190; // expired/invalid access token
  }

  get isRateLimit(): boolean {
    return this.code === 4 || this.code === 17 || this.code === 613;
  }
}

export interface GraphPage<T> {
  data: T[];
  paging?: { next?: string };
}

const BASE = "https://graph.facebook.com";

export function graphConfig(): { token: string; accountId: string; version: string } | null {
  const token = process.env.META_ACCESS_TOKEN;
  let accountId = process.env.META_AD_ACCOUNT_ID;
  if (!token || !accountId) return null;
  if (!accountId.startsWith("act_")) accountId = `act_${accountId}`;
  return { token, accountId, version: process.env.META_API_VERSION ?? "v23.0" };
}

async function requestJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // fall through — non-JSON body handled below
  }
  const err = (body as { error?: { message?: string; code?: number; type?: string } })?.error;
  if (err) {
    throw new GraphApiError(
      err.message ?? `Graph API error (${res.status})`,
      err.code ?? null,
      err.type ?? null,
    );
  }
  if (!res.ok) {
    throw new GraphApiError(`Graph API HTTP ${res.status}`, null, null);
  }
  return body;
}

async function requestWithRetry(url: string): Promise<unknown> {
  try {
    return await requestJson(url);
  } catch (e) {
    if (e instanceof GraphApiError && e.isRateLimit) {
      await new Promise((r) => setTimeout(r, 3000));
      return requestJson(url);
    }
    throw e;
  }
}

export type GraphFetcher = (path: string, params: Record<string, string>) => Promise<unknown>;

/** GET {BASE}/{version}/{path} with the token appended. */
export const graphGet: GraphFetcher = async (path, params) => {
  const config = graphConfig();
  if (!config) throw new GraphApiError("Meta API sync is not configured", null, null);
  const url = new URL(`${BASE}/${config.version}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", config.token);
  return requestWithRetry(url.toString());
};

/**
 * Collect every page of a Graph list response. `paging.next` is an absolute
 * URL that already carries the token; capped to avoid runaway pagination.
 */
export async function fetchAllPages<T>(
  path: string,
  params: Record<string, string>,
  fetcher: GraphFetcher = graphGet,
  fetchNext: (url: string) => Promise<unknown> = requestWithRetry,
  maxPages = 200,
): Promise<T[]> {
  const rows: T[] = [];
  let page = (await fetcher(path, params)) as GraphPage<T>;
  rows.push(...(page.data ?? []));
  let pages = 1;
  while (page.paging?.next && pages < maxPages) {
    page = (await fetchNext(page.paging.next)) as GraphPage<T>;
    rows.push(...(page.data ?? []));
    pages += 1;
  }
  return rows;
}
