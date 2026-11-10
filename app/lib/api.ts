export type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
  };
};

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export async function apiGet<T>(path: string, options?: { signal?: AbortSignal }): Promise<T> {
  const response = await fetch(path, {
    headers: { accept: "application/json" },
    cache: "no-store",
    signal: options?.signal,
  });
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const errorBody = body as ApiErrorBody | null;
    throw new ApiError(
      errorBody?.error?.message ?? `Permintaan API gagal (${response.status}).`,
      response.status,
      errorBody?.error?.code,
    );
  }

  return body as T;
}
