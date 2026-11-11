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

export type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  token?: string;
  body?: unknown;
  signal?: AbortSignal;
};

export function formatApiError(error: unknown): {
  title: string;
  message: string;
  status?: number;
  code?: string;
  isUnauthorized: boolean;
  isConflict: boolean;
} {
  if (error instanceof ApiError) {
    const baseMessage = error.message;
    switch (error.status) {
      case 400:
        return {
          title: "Data belum sesuai",
          message: baseMessage || "Periksa kembali data yang kamu isi.",
          status: 400,
          code: error.code,
          isUnauthorized: false,
          isConflict: false,
        };
      case 401:
        return {
          title: "Silakan masuk kembali",
          message: baseMessage || "Sesi kamu telah berakhir. Silakan masuk untuk melanjutkan.",
          status: 401,
          code: error.code,
          isUnauthorized: true,
          isConflict: false,
        };
      case 403:
        return {
          title: "Akses tidak diizinkan",
          message:
            baseMessage ||
            "Pastikan nomor HP kamu sudah terverifikasi dan kamu memiliki akses untuk tindakan ini.",
          status: 403,
          code: error.code,
          isUnauthorized: false,
          isConflict: false,
        };
      case 404:
        return {
          title: "Data tidak ditemukan",
          message: baseMessage || "Data yang kamu cari sudah tidak tersedia.",
          status: 404,
          code: error.code,
          isUnauthorized: false,
          isConflict: false,
        };
      case 409:
        return {
          title: "Tidak dapat diproses",
          message:
            baseMessage ||
            "Tindakan ini sudah pernah dilakukan atau status data telah berubah.",
          status: 409,
          code: error.code,
          isUnauthorized: false,
          isConflict: true,
        };
      case 502:
        return {
          title: "Koneksi ke server terputus",
          message: "Layanan sedang tidak dapat dihubungi. Coba beberapa saat lagi.",
          status: 502,
          code: error.code,
          isUnauthorized: false,
          isConflict: false,
        };
      case 503:
        return {
          title: "Layanan belum tersedia",
          message:
            baseMessage ||
            "Fitur ini sedang dalam pemeliharaan. Silakan coba lagi nanti.",
          status: 503,
          code: error.code,
          isUnauthorized: false,
          isConflict: false,
        };
      default:
        return {
          title: "Terjadi kendala",
          message: baseMessage || "Permintaan belum dapat diproses saat ini.",
          status: error.status,
          code: error.code,
          isUnauthorized: false,
          isConflict: false,
        };
    }
  }

  return {
    title: "Terjadi kendala",
    message: error instanceof Error ? error.message : "Terjadi kesalahan. Silakan coba lagi.",
    isUnauthorized: false,
    isConflict: false,
  };
}

export async function apiRequest<T>(path: string, options?: RequestOptions): Promise<T> {
  const method = options?.method ?? "GET";
  const headers: Record<string, string> = {
    accept: "application/json",
  };

  if (options?.token?.trim()) {
    const cleanToken = options.token.trim().replace(/^Bearer\s+/i, "");
    headers.authorization = `Bearer ${cleanToken}`;
  }

  let requestBody: BodyInit | undefined;
  if (options?.body !== undefined) {
    if (options.body instanceof FormData) {
      requestBody = options.body;
    } else {
      headers["content-type"] = "application/json";
      requestBody = JSON.stringify(options.body);
    }
  }

  const response = await fetch(path, {
    method,
    headers,
    body: requestBody,
    cache: "no-store",
    signal: options?.signal,
  });

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const errorBody = body as ApiErrorBody | null;
    throw new ApiError(
      errorBody?.error?.message ?? "Permintaan belum dapat diproses.",
      response.status,
      errorBody?.error?.code,
    );
  }

  return body as T;
}

export async function apiGet<T>(
  path: string,
  options?: { token?: string; signal?: AbortSignal },
): Promise<T> {
  return apiRequest<T>(path, { method: "GET", token: options?.token, signal: options?.signal });
}

export async function apiPost<T>(
  path: string,
  options?: { token?: string; body?: unknown; signal?: AbortSignal },
): Promise<T> {
  return apiRequest<T>(path, {
    method: "POST",
    token: options?.token,
    body: options?.body,
    signal: options?.signal,
  });
}

export async function apiPatch<T>(
  path: string,
  options?: { token?: string; body?: unknown; signal?: AbortSignal },
): Promise<T> {
  return apiRequest<T>(path, {
    method: "PATCH",
    token: options?.token,
    body: options?.body,
    signal: options?.signal,
  });
}

export async function apiDelete<T>(
  path: string,
  options?: { token?: string; signal?: AbortSignal },
): Promise<T> {
  return apiRequest<T>(path, { method: "DELETE", token: options?.token, signal: options?.signal });
}
