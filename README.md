# Aquaku

Frontend Next.js untuk integrasi dan QA internal Marketplace Aquaku setelah M5, sesuai [`docs.md`](docs.md) dan kontrak [`openapi.yaml`](openapi.yaml).

## Menjalankan aplikasi

Persyaratan: Node.js 20.9 atau lebih baru dan backend Aquaku aktif di `http://localhost:3000/api/v1`.

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Next.js berjalan di `http://localhost:3001`. Secara default `AQUAKU_API_BASE_URL` diarahkan ke `http://localhost:3000/api/v1` sesuai `docs.md`. Route handler Next.js di `/api/v1/*` meneruskan request ke backend (termasuk query string, method `GET`/`POST`/`PATCH`/`DELETE`, dan header `Authorization: Bearer <access-token>`).

## Endpoint yang terintegrasi di UI

- **Publik**:
  - `GET /marketplace/regions`
  - `GET /marketplace/taxonomy`
  - `GET /marketplace/listings`
  - `GET /marketplace/listings/{listingId}`
  - `GET /users/{userId}`
- **Akun & Autentikasi**:
  - `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`
  - `POST /auth/verify-phone`, `POST /auth/otp/resend`
  - `GET /users/me`
- **Penjual & Listing**:
  - `GET /marketplace/me/listings`, `GET /marketplace/me/quota`
  - `POST /marketplace/listings`, `PATCH /marketplace/listings/{listingId}`, `DELETE /marketplace/listings/{listingId}`
  - `POST /marketplace/listings/{listingId}/renew`, `POST /marketplace/listings/{listingId}/reactivate`
  - `POST /marketplace/media/upload-signatures`, `POST /marketplace/media/confirm-upload`, `DELETE /marketplace/media/{assetId}`
  - `POST /marketplace/listings/{listingId}/sold` (opsional `buyer_id`)
  - `POST /marketplace/listings/{listingId}/sale`
  - `DELETE /marketplace/sales/{saleId}`
  - `GET /marketplace/me/sales`
- **Pembeli & Rating**:
  - `GET /marketplace/me/purchases`
  - `POST /marketplace/sales/{saleId}/respond` (`CONFIRM` / `REJECT`)
  - `POST /marketplace/sales/{saleId}/rating` (skor `1`–`5`)
- **Laporan & Moderasi Admin**:
  - `POST /marketplace/reports`, `GET /marketplace/me/reports`
  - `GET /marketplace/admin/reports`, `POST /marketplace/admin/reports/{reportId}/review`
  - `GET, POST /marketplace/admin/listings/{listingId}/moderation` (`HIDE` / `RESTORE`)
  - `POST /marketplace/admin/sales/{saleId}/correct-buyer`, `GET /marketplace/admin/sales/{saleId}/corrections`

## Pemeriksaan

```powershell
npm run typecheck
npm run build
```
