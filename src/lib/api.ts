import { NextResponse } from "next/server";
import type { ZodType } from "zod";

export function jsonError(
  status: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json({ error: { code, message, ...extra } }, { status });
}

export async function parseBody<T>(
  req: Request,
  schema: ZodType<T>,
): Promise<{ data: T; error?: never } | { data?: never; error: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { error: jsonError(400, "invalid_json", "Request body must be JSON") };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "_";
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return {
      error: jsonError(400, "validation", "Some fields need attention", { fieldErrors }),
    };
  }
  return { data: parsed.data };
}

export function idFromParam(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Map SQLite constraint failures to friendly API errors; rethrow anything else. */
export function sqliteErrorResponse(e: unknown): NextResponse {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("UNIQUE constraint failed")) {
    if (msg.includes(".name")) {
      return jsonError(409, "duplicate_name", "That name is already in use at this level");
    }
    return jsonError(409, "duplicate", "This record already exists");
  }
  if (msg.includes("FOREIGN KEY constraint failed")) {
    return jsonError(400, "bad_reference", "A referenced record does not exist");
  }
  if (msg.includes("CHECK constraint failed")) {
    return jsonError(400, "constraint", "A field value is out of range");
  }
  throw e;
}
