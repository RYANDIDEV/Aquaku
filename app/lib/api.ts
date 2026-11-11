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
          title: "400 Bad Request",
          message: baseMessage || "Payload atau parameter yang dikirim tidak valid.",
          status: 400,
          code: error.code,
          isUnauthorized: false,
          isConflict: false,
        };
      case 401:
        return {
          title: "401 Unauthorized",
          message: baseMessage || "Access token tidak ada atau tidak valid. Silakan login atau perbarui token.",
          status: 401,
          code: error.code,
          isUnauthorized: true,
          isConflict: false,
        };
      case 403:
        return {
          title: "403 Forbidden",
          message:
            baseMessage ||
            "Akses ditolak: pastikan akun adalah pemilik/pembeli/admin yang berhak dan nomor HP sudah terverifikasi.",
          status: 403,
          code: error.code,
          isUnauthorized: false,
          isConflict: false,
        };
      case 404:
        return {
          title: "404 Not Found",
          message: baseMessage || "Resource tidak ditemukan atau listing tidak tersedia secara publik.",
          status: 404,
          code: error.code,
          isUnauthorized: false,
          isConflict: false,
        };
      case 409:
        return {
          title: "409 Conflict",
          message:
            baseMessage ||
            "Transisi status tidak diizinkan, transaksi/laporan duplikat, atau rating tidak dapat diubah. Data telah dimuat ulang.",
          status: 409,
          code: error.code,
          isUnauthorized: false,
          isConflict: true,
        };
      case 502:
        return {
          title: "502 Bad Gateway",
          message: "Backend API belum bisa dihubungi. Pastikan server backend aktif di http://localhost:3000/api/v1.",
          status: 502,
          code: error.code,
          isUnauthorized: false,
          isConflict: false,
        };
      case 503:
        return {
          title: "503 Service Unavailable",
          message:
            baseMessage ||
            "Layanan eksternal (seperti Cloudinary atau provider OTP) belum terkonfigurasi atau tidak tersedia.",
          status: 503,
          code: error.code,
          isUnauthorized: false,
          isConflict: false,
        };
      default:
        return {
          title: `Error ${error.status}`,
          message: baseMessage,
          status: error.status,
          code: error.code,
          isUnauthorized: false,
          isConflict: false,
        };
    }
  }

  return {
    title: "Kesalahan",
    message: error instanceof Error ? error.message : "Terjadi kesalahan yang tidak diketahui.",
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
      errorBody?.error?.message ?? `Permintaan API gagal (${response.status}).`,
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
