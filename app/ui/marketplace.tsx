"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ApiError, apiGet } from "../lib/api";
import type {
  ApiEnvelope,
  Category,
  Condition,
  Listing,
  ListingPage,
  Region,
  Taxonomy,
} from "../types/marketplace";

type Filters = {
  q: string;
  category: string;
  condition: string;
  regionCode: string;
  districtCode: string;
  minPrice: string;
  maxPrice: string;
  sort: "newest" | "price_asc" | "price_desc";
};

const INITIAL_FILTERS: Filters = {
  q: "",
  category: "",
  condition: "",
  regionCode: "",
  districtCode: "",
  minPrice: "",
  maxPrice: "",
  sort: "newest",
};

const CONDITION_LABELS: Record<Condition, string> = {
  BNIB: "BNIB",
  NEW: "New",
  LIKE_NEW: "Like New",
  SECOND: "Second",
};

function formatPrice(price: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(price);
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 502) return "Backend API belum bisa dihubungi. Pastikan server backend aktif di port 3000.";
    return error.message;
  }
  return error instanceof Error ? error.message : "Terjadi kesalahan yang tidak diketahui.";
}

export function Marketplace() {
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(INITIAL_FILTERS);
  const [page, setPage] = useState(1);
  const [listings, setListings] = useState<Listing[]>([]);
  const [pagination, setPagination] = useState<ListingPage["pagination"]>({
    page: 1,
    limit: 20,
    total: 0,
    pages: 0,
  });
  const [categories, setCategories] = useState<Category[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [referenceError, setReferenceError] = useState("");
  const [listError, setListError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [detailError, setDetailError] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const detailRequest = useRef<AbortController | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [themeReady, setThemeReady] = useState(false);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("aquaku-theme");
    const initialTheme = savedTheme === "light" || savedTheme === "dark" ? savedTheme : "light";
    setTheme(initialTheme);
    document.documentElement.dataset.theme = initialTheme;
    setThemeReady(true);
  }, []);

  useEffect(() => {
    if (!themeReady) return;
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("aquaku-theme", theme);
  }, [theme, themeReady]);

  useEffect(() => () => detailRequest.current?.abort(), []);

  useEffect(() => {
    const controller = new AbortController();
    async function loadReferenceData() {
      const [taxonomyResult, regionsResult] = await Promise.allSettled([
        apiGet<ApiEnvelope<Taxonomy>>("/api/v1/marketplace/taxonomy", { signal: controller.signal }),
        apiGet<ApiEnvelope<Region[]>>("/api/v1/marketplace/regions", { signal: controller.signal }),
      ]);

      if (controller.signal.aborted) return;

      const errors: string[] = [];
      if (taxonomyResult.status === "fulfilled") {
        setCategories(taxonomyResult.value.data.categories);
      } else {
        errors.push(`Taksonomi kategori tidak tersedia: ${getErrorMessage(taxonomyResult.reason)}`);
      }

      if (regionsResult.status === "fulfilled") {
        setRegions(regionsResult.value.data);
      } else {
        errors.push(`Daftar wilayah tidak tersedia: ${getErrorMessage(regionsResult.reason)}`);
      }

      setReferenceError(errors.join(" "));
    }

    void loadReferenceData();
    return () => controller.abort();
  }, []);

  const queryString = useMemo(() => {
    const query = new URLSearchParams({ page: String(page), limit: "20", sort: appliedFilters.sort });
    if (appliedFilters.q.trim()) query.set("q", appliedFilters.q.trim());
    if (appliedFilters.category) query.set("category", appliedFilters.category);
    if (appliedFilters.condition) query.set("condition", appliedFilters.condition);
    if (appliedFilters.regionCode) query.set("region_code", appliedFilters.regionCode);
    else if (appliedFilters.districtCode) query.set("district_code", appliedFilters.districtCode);
    if (appliedFilters.minPrice) query.set("min_price", appliedFilters.minPrice);
    if (appliedFilters.maxPrice) query.set("max_price", appliedFilters.maxPrice);
    return query.toString();
  }, [appliedFilters, page]);

  const loadListings = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setListError("");
    try {
      const result = await apiGet<ApiEnvelope<ListingPage>>(
        `/api/v1/marketplace/listings?${queryString}`,
        { signal },
      );
      if (signal.aborted) return;
      setListings(result.data.items);
      setPagination(result.data.pagination);
    } catch (error) {
      if (!signal.aborted) setListError(getErrorMessage(error));
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [queryString, reload]);

  useEffect(() => {
    const controller = new AbortController();
    void loadListings(controller.signal);
    return () => controller.abort();
  }, [loadListings]);

  const districts = useMemo(() => {
    const unique = new Map<string, string>();
    for (const region of regions) unique.set(region.district_code, region.district);
    return [...unique.entries()].sort((a, b) => a[1].localeCompare(b[1], "id"));
  }, [regions]);

  const visibleRegions = useMemo(
    () => regions.filter((region) => !filters.districtCode || region.district_code === filters.districtCode),
    [filters.districtCode, regions],
  );

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setAppliedFilters({ ...filters });
  }

  function resetFilters() {
    setFilters(INITIAL_FILTERS);
    setAppliedFilters(INITIAL_FILTERS);
    setPage(1);
  }

  async function openListing(listing: Listing) {
    detailRequest.current?.abort();
    const controller = new AbortController();
    detailRequest.current = controller;
    setSelectedListing(listing);
    setDetailError("");
    setDetailLoading(true);
    try {
      const result = await apiGet<ApiEnvelope<Listing>>(
        `/api/v1/marketplace/listings/${encodeURIComponent(listing.id)}`,
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      setSelectedListing(result.data);
    } catch (error) {
      if (!controller.signal.aborted) setDetailError(getErrorMessage(error));
    } finally {
      if (!controller.signal.aborted) {
        detailRequest.current = null;
        setDetailLoading(false);
      }
    }
  }

  function closeListing() {
    detailRequest.current?.abort();
    detailRequest.current = null;
    setSelectedListing(null);
    setDetailLoading(false);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Aquaku beranda">
          <span className="brand-mark"><img src="/icon.jpeg" alt="" width="40" height="40" /></span>
          <span className="brand-copy">Aquaku<small>komunitas aquascape</small></span>
        </a>
        <nav className="nav" aria-label="Navigasi utama">
          <a className="nav-link" href="/#forum" aria-disabled="true" title="Endpoint forum belum tersedia di kontrak backend saat ini">
            <Icon name="forum" /><span>Forum</span>
          </a>
          <a className="nav-link active" href="/">
            <Icon name="market" /><span>Marketplace</span>
          </a>
        </nav>
        <div className="top-actions">
          <button
            className="theme-toggle"
            type="button"
            aria-label={theme === "dark" ? "Aktifkan mode terang" : "Aktifkan mode gelap"}
            aria-pressed={theme === "dark"}
            onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")}
          >
            <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span><span className="theme-label">Mode</span>
          </button>
          <span className="location-pill"><Icon name="pin" /> Semarang</span>
        </div>
      </header>

      <main className="main-content">
        <section className="intro">
          <div>
            <p className="eyebrow">Jual beli lokal, tumbuh bareng</p>
            <h1>Temukan isi tank-mu</h1>
            <p className="subtitle">Tanaman, fauna, dan perlengkapan aquascape dari sekitar Semarang.</p>
          </div>
          <div className="local-note"><span className="online-dot" /> Listing aktif di Semarang</div>
        </section>

        <form className="filter-panel" onSubmit={applyFilters}>
          <label className="search-field">
            <Icon name="search" />
            <input
              type="search"
              maxLength={100}
              placeholder="Cari tanaman, alat, atau toko..."
              value={filters.q}
              onChange={(event) => updateFilter("q", event.target.value)}
            />
          </label>

          <div className="filter-grid">
            <label className="field">
              <span>Kategori</span>
              <select value={filters.category} onChange={(event) => updateFilter("category", event.target.value)}>
                <option value="">Semua kategori</option>
                {categories.map((category) => <option key={category.id} value={category.slug}>{category.name}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Kondisi</span>
              <select value={filters.condition} onChange={(event) => updateFilter("condition", event.target.value)}>
                <option value="">Semua kondisi</option>
                <option value="BNIB">BNIB</option>
                <option value="NEW">New</option>
                <option value="LIKE_NEW">Like New</option>
                <option value="SECOND">Second</option>
              </select>
            </label>
            <label className="field">
              <span>Kecamatan</span>
              <select
                value={filters.districtCode}
                onChange={(event) => {
                  updateFilter("districtCode", event.target.value);
                  updateFilter("regionCode", "");
                }}
              >
                <option value="">Semua kecamatan</option>
                {districts.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Kelurahan</span>
              <select
                value={filters.regionCode}
                onChange={(event) => updateFilter("regionCode", event.target.value)}
                disabled={!regions.length}
              >
                <option value="">Semua kelurahan</option>
                {visibleRegions.map((region) => <option key={region.code} value={region.code}>{region.kelurahan}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Harga minimum</span>
              <input type="number" min="1" placeholder="Rp minimum" value={filters.minPrice} onChange={(event) => updateFilter("minPrice", event.target.value)} />
            </label>
            <label className="field">
              <span>Harga maksimum</span>
              <input type="number" min="1" placeholder="Rp maksimum" value={filters.maxPrice} onChange={(event) => updateFilter("maxPrice", event.target.value)} />
            </label>
            <label className="field">
              <span>Urutkan</span>
              <select value={filters.sort} onChange={(event) => updateFilter("sort", event.target.value as Filters["sort"])}>
                <option value="newest">Terbaru</option>
                <option value="price_asc">Harga terendah</option>
                <option value="price_desc">Harga tertinggi</option>
              </select>
            </label>
          </div>

          <div className="filter-actions">
            <button type="button" className="button-secondary" onClick={resetFilters}>Reset filter</button>
            <button type="submit" className="button-primary"><Icon name="search" /> Tampilkan hasil</button>
          </div>
        </form>

        {referenceError && <p className="notice warning" role="status">{referenceError} Filter terkait mungkin belum tersedia.</p>}

        <div className="results-heading">
          <div><h2>Listing sekitar Semarang</h2><p>{loading ? "Memuat listing..." : `${pagination.total} listing ditemukan`}</p></div>
          <span className="result-page">{pagination.pages > 0 ? `Halaman ${pagination.page} dari ${pagination.pages}` : "Tanpa komisi transaksi"}</span>
        </div>

        {listError ? (
          <div className="error-state" role="alert">
            <span className="error-icon">!</span>
            <h3>Listing belum dapat dimuat</h3>
            <p>{listError}</p>
            <button className="button-secondary" type="button" onClick={() => setReload((current) => current + 1)}>Coba lagi</button>
          </div>
        ) : loading ? (
          <div className="listing-grid" aria-label="Memuat listing">
            {Array.from({ length: 6 }, (_, index) => <div className="skeleton-card" key={index}><div /><span /><span /></div>)}
          </div>
        ) : listings.length ? (
          <div className="listing-grid">
            {listings.map((listing) => <ListingCard key={listing.id} listing={listing} onOpen={() => void openListing(listing)} />)}
          </div>
        ) : (
          <div className="empty-state"><span>🪴</span><h3>Belum ada listing yang cocok</h3><p>Coba ubah kata kunci atau filter pencarianmu.</p><button className="button-secondary" onClick={resetFilters}>Hapus semua filter</button></div>
        )}

        {!listError && pagination.pages > 1 && (
          <nav className="pagination" aria-label="Halaman listing">
            <button type="button" className="button-secondary" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)}>Sebelumnya</button>
            <span>{pagination.page} / {pagination.pages}</span>
            <button type="button" className="button-secondary" disabled={page >= pagination.pages || loading} onClick={() => setPage((current) => current + 1)}>Berikutnya</button>
          </nav>
        )}
      </main>

      <nav className="mobile-nav" aria-label="Navigasi bawah">
        <span className="mobile-nav-item disabled"><Icon name="forum" /><span>Forum</span></span>
        <a className="mobile-nav-item active" href="/"><Icon name="market" /><span>Marketplace</span></a>
      </nav>

      {selectedListing && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeListing(); }}>
          <section className="detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-title">
            <button className="modal-close" type="button" aria-label="Tutup detail" onClick={closeListing}>×</button>
            {detailLoading ? <p className="detail-message">Memuat detail listing...</p> : detailError ? <p className="detail-message error-text" role="alert">{detailError}</p> : (
              <>
                <ListingImage listing={selectedListing} className="detail-image" />
                <div className="detail-content">
                  <span className="condition-tag">{CONDITION_LABELS[selectedListing.condition]}</span>
                  <h2 id="detail-title">{selectedListing.title}</h2>
                  <p className="detail-price">{formatPrice(selectedListing.price)}</p>
                  <p className="detail-description">{selectedListing.description}</p>
                  <div className="detail-meta">
                    <span><Icon name="pin" /> {selectedListing.location.kelurahan}, {selectedListing.location.district}</span>
                    <span>Penjual: {selectedListing.seller.display_name || "Penjual Aquaku"}{selectedListing.seller.verified_store ? " · Terverifikasi" : ""}</span>
                    <span>Dipasang {formatDate(selectedListing.created_at)}</span>
                  </div>
                  {selectedListing.seller.whatsapp_url && <a className="button-primary contact-button" href={selectedListing.seller.whatsapp_url} target="_blank" rel="noreferrer">Hubungi penjual</a>}
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function ListingCard({ listing, onOpen }: { listing: Listing; onOpen: () => void }) {
  return (
    <button className="listing-card" type="button" onClick={onOpen} aria-label={`Lihat ${listing.title}`}>
      <ListingImage listing={listing} className="listing-image" />
      <div className="listing-info">
        <div className="listing-tags"><span className="condition-tag">{CONDITION_LABELS[listing.condition]}</span>{listing.seller.verified_store && <span className="verified-tag">✓ Toko terverifikasi</span>}</div>
        <h3>{listing.title}</h3>
        <p className="listing-category">{listing.category.name} · {listing.location.kelurahan}</p>
        <div className="listing-bottom"><strong>{formatPrice(listing.price)}</strong><span>{listing.seller.display_name || "Penjual Aquaku"}</span></div>
      </div>
    </button>
  );
}

function ListingImage({ listing, className }: { listing: Listing; className: string }) {
  const image = listing.photos.find((photo) => photo.url)?.url;
  return (
    <div className={className}>
      {image ? <img src={image} alt={listing.title} loading="lazy" /> : <span aria-hidden="true">🪴</span>}
      <span className="location-stamp"><Icon name="pin" /> {listing.location.district}</span>
    </div>
  );
}

function Icon({ name }: { name: "forum" | "market" | "pin" | "search" }) {
  const paths = {
    forum: <><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H6l-3 2v-6a7.5 7.5 0 1 1 17-3.5Z" /><path d="M8 11h8M8 14.5h5" /></>,
    market: <><path d="M3 9h18l-1.5 11h-15L3 9Z" /><path d="m3 9 2-5h14l2 5M9 9l1 11m5-11-1 11" /></>,
    pin: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4 4" /></>,
  };
  return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
