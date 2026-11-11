# Aquaku

Frontend Next.js untuk Marketplace Aquaku, terhubung ke backend yang dijelaskan dalam `openapi.yaml`.

## Menjalankan aplikasi

Persyaratan: Node.js 20.9 atau lebih baru dan backend Aquaku aktif.

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Next.js berjalan di `http://localhost:3001`. Secara default frontend memakai backend staging yang tercantum di `openapi.yaml`. Untuk backend lokal, ubah `AQUAKU_API_BASE_URL` pada `.env.local` menjadi `http://localhost:3000/api/v1`.

Route handler Next.js di `/api/v1/*` meneruskan request ke backend, termasuk query string dan bearer token, agar browser tetap memakai same-origin. Endpoint publik Marketplace yang digunakan:

- `GET /marketplace/listings`
- `GET /marketplace/listings/{listingId}`
- `GET /marketplace/taxonomy`
- `GET /marketplace/regions`

Backend tidak tersedia di repository ini. Jika API gagal dihubungi, antarmuka menampilkan status dan pesan kegagalan koneksi, bukan data listing contoh.

## Pemeriksaan

```powershell
npm run typecheck
npm run build
```
