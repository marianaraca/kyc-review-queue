import type { ApiResponse } from "@/lib/types";

/** Thin client for the uniform { success, data?, error? } envelope. */
export async function apiFetch<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await res.json()) as ApiResponse<T>;
  if (!body.success) throw new Error(body.error);
  return body.data;
}
