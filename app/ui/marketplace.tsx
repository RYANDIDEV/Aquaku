"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { ApiError, apiDelete, apiGet, apiPatch, apiPost, formatApiError } from "../lib/api";
import type {
  AdminReportDecision,
  AdminReportFilterStatus,
  ApiEnvelope,
  BuyerDecision,
  Category,
  Condition,
  Listing,
  ListingPage,
  MarkSoldData,
  ModerationAction,
  ModerationActionType,
  ModerationResult,
  OtpResendData,
  PublicProfile,
  Quota,
  Rating,
  Region,
  RegisterResponse,
  Report,
  ReportReason,
  ReportTargetType,
  SaleCorrection,
  SaleTransaction,
  Tag,
  Taxonomy,
  TokenPair,
  UploadSignatureData,
  UserProfile,
} from "../types/marketplace";

type ActiveTab = "explore" | "my-listings" | "transactions" | "reports" | "admin" | "account";

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

type BannerNotice = {
  type: "success" | "error" | "warning" | "info";
  title: string;
  message: string;
  code?: string;
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

const LISTING_STATUS_LABELS: Record<Listing["status"], string> = {
  active: "Active",
  sold: "Sold",
  expired: "Expired",
  inactive: "Inactive",
};

const TRANSACTION_STATUS_LABELS: Record<SaleTransaction["status"], string> = {
  awaiting_confirmation: "Menunggu Konfirmasi Pembeli",
  confirmed: "Confirmed (Terkonfirmasi)",
  rejected: "Rejected (Ditolak Pembeli)",
  cancelled: "Cancelled (Dibatalkan Penjual)",
};

const REPORT_REASONS: Array<{ value: ReportReason; label: string }> = [
  { value: "SPAM", label: "SPAM — Spam atau iklan berulang" },
  { value: "SCAM", label: "SCAM — Indikasi penipuan" },
  { value: "PROHIBITED_ITEM", label: "PROHIBITED_ITEM — Barang terlarang/dilindungi" },
  { value: "MISLEADING", label: "MISLEADING — Informasi/foto menyesatkan" },
  { value: "HARASSMENT", label: "HARASSMENT — Pelecehan atau penyalahgunaan" },
  { value: "OTHER", label: "OTHER — Lainnya" },
];

function formatPrice(price: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(price);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
}

export function Marketplace() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("explore");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [themeReady, setThemeReady] = useState(false);
  const [banner, setBanner] = useState<BannerNotice | null>(null);

  // Auth & Session state
  const [accessToken, setAccessToken] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [devOtpHint, setDevOtpHint] = useState("");

  // Auth forms
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regDisplayName, setRegDisplayName] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");

  // Public Reference & Explore state
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
  const [tags, setTags] = useState<Tag[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [referenceError, setReferenceError] = useState("");
  const [listError, setListError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);

  // Selected listing modal & public profile modal
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [detailError, setDetailError] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const detailRequest = useRef<AbortController | null>(null);

  const [lookupUserId, setLookupUserId] = useState("");
  const [publicProfile, setPublicProfile] = useState<PublicProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");

  // My Listings & Quota state
  const [myListings, setMyListings] = useState<Listing[]>([]);
  const [myListingsPagination, setMyListingsPagination] = useState<ListingPage["pagination"]>({
    page: 1,
    limit: 20,
    total: 0,
    pages: 0,
  });
  const [myListingsPage, setMyListingsPage] = useState(1);
  const [myListingsLoading, setMyListingsLoading] = useState(false);
  const [quota, setQuota] = useState<Quota | null>(null);

  // Create / Edit Listing form
  const [editingListingId, setEditingListingId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formPrice, setFormPrice] = useState("");
  const [formCategoryId, setFormCategoryId] = useState("");
  const [formRegionCode, setFormRegionCode] = useState("");
  const [formCondition, setFormCondition] = useState<Condition>("SECOND");
  const [formPhotoIds, setFormPhotoIds] = useState<string[]>([]);
  const [manualPhotoIdInput, setManualPhotoIdInput] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [submittingListing, setSubmittingListing] = useState(false);

  // Mark sold & link buyer state
  const [soldBuyerInputs, setSoldBuyerInputs] = useState<Record<string, string>>({});
  const [lastMarkSoldResult, setLastMarkSoldResult] = useState<MarkSoldData | null>(null);

  // Transactions & Rating state
  const [sales, setSales] = useState<SaleTransaction[]>([]);
  const [purchases, setPurchases] = useState<SaleTransaction[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [respondNotes, setRespondNotes] = useState<Record<string, string>>({});
  const [ratingScores, setRatingScores] = useState<Record<string, number>>({});
  const [replaceBuyerInputs, setReplaceBuyerInputs] = useState<Record<string, string>>({});

  // Reports state
  const [myReports, setMyReports] = useState<Report[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportTargetType, setReportTargetType] = useState<ReportTargetType>("LISTING");
  const [reportTargetId, setReportTargetId] = useState("");
  const [reportReason, setReportReason] = useState<ReportReason>("MISLEADING");
  const [reportDetails, setReportDetails] = useState("");
  const [submittingReport, setSubmittingReport] = useState(false);

  // Admin state
  const [adminReportStatusFilter, setAdminReportStatusFilter] = useState<AdminReportFilterStatus | "ALL">("OPEN");
  const [adminReports, setAdminReports] = useState<Report[]>([]);
  const [adminReportsLoading, setAdminReportsLoading] = useState(false);
  const [adminReviewDecision, setAdminReviewDecision] = useState<Record<string, AdminReportDecision>>({});
  const [adminReviewNotes, setAdminReviewNotes] = useState<Record<string, string>>({});

  const [modListingId, setModListingId] = useState("");
  const [modAction, setModAction] = useState<ModerationActionType>("HIDE");
  const [modReason, setModReason] = useState("");
  const [modHistory, setModHistory] = useState<ModerationAction[]>([]);
  const [modResult, setModResult] = useState<ModerationResult | null>(null);
  const [modLoading, setModLoading] = useState(false);

  const [correctSaleId, setCorrectSaleId] = useState("");
  const [correctBuyerId, setCorrectBuyerId] = useState("");
  const [correctReason, setCorrectReason] = useState("");
  const [saleCorrections, setSaleCorrections] = useState<SaleCorrection[]>([]);
  const [correctionsLoading, setCorrectionsLoading] = useState(false);

  // Theme & saved token initialization
  useEffect(() => {
    const savedTheme = window.localStorage.getItem("aquaku-theme");
    const initialTheme = savedTheme === "light" || savedTheme === "dark" ? savedTheme : "light";
    setTheme(initialTheme);
    document.documentElement.dataset.theme = initialTheme;
    setThemeReady(true);

    const savedAccess = window.localStorage.getItem("aquaku-access-token") ?? "";
    const savedRefresh = window.localStorage.getItem("aquaku-refresh-token") ?? "";
    if (savedAccess) {
      setAccessToken(savedAccess);
      setTokenInput(savedAccess);
    }
    if (savedRefresh) {
      setRefreshToken(savedRefresh);
    }
  }, []);

  useEffect(() => {
    if (!themeReady) return;
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("aquaku-theme", theme);
  }, [theme, themeReady]);

  useEffect(() => () => detailRequest.current?.abort(), []);

  const handleApiError = useCallback(
    (error: unknown, onConflictRefresh?: () => void) => {
      const formatted = formatApiError(error);
      setBanner({
        type: formatted.isConflict ? "warning" : "error",
        title: formatted.title,
        message: formatted.message,
        code: formatted.code,
      });

      if (formatted.isUnauthorized) {
        setActiveTab("account");
      }

      if (formatted.isConflict && onConflictRefresh) {
        onConflictRefresh();
      }
    },
    [],
  );

  // Load current user profile when accessToken changes
  const fetchCurrentUser = useCallback(
    async (tokenToUse: string) => {
      if (!tokenToUse.trim()) {
        setCurrentUser(null);
        return;
      }
      setAuthLoading(true);
      try {
        const res = await apiGet<ApiEnvelope<UserProfile>>("/api/v1/users/me", { token: tokenToUse });
        setCurrentUser(res.data);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          setCurrentUser(null);
        }
      } finally {
        setAuthLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (accessToken) {
      window.localStorage.setItem("aquaku-access-token", accessToken);
      void fetchCurrentUser(accessToken);
    } else {
      window.localStorage.removeItem("aquaku-access-token");
      setCurrentUser(null);
    }
  }, [accessToken, fetchCurrentUser]);

  // Load Public Reference Data (Taxonomy & Regions)
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
        setTags(taxonomyResult.value.data.tags);
        if (taxonomyResult.value.data.categories[0]) {
          setFormCategoryId((prev) => prev || taxonomyResult.value.data.categories[0].id);
        }
      } else {
        errors.push(`Taksonomi kategori tidak tersedia: ${formatApiError(taxonomyResult.reason).message}`);
      }

      if (regionsResult.status === "fulfilled") {
        setRegions(regionsResult.value.data);
        if (regionsResult.value.data[0]) {
          setFormRegionCode((prev) => prev || regionsResult.value.data[0].code);
        }
      } else {
        errors.push(`Daftar wilayah tidak tersedia: ${formatApiError(regionsResult.reason).message}`);
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

  const loadListings = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setListError("");
      try {
        const result = await apiGet<ApiEnvelope<ListingPage>>(
          `/api/v1/marketplace/listings?${queryString}`,
          { signal },
        );
        if (signal?.aborted) return;
        setListings(result.data.items);
        setPagination(result.data.pagination);
      } catch (error) {
        if (!signal?.aborted) setListError(formatApiError(error).message);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [queryString, reload],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadListings(controller.signal);
    return () => controller.abort();
  }, [loadListings]);

  // Load My Listings & Quota
  const loadMyListingsAndQuota = useCallback(async () => {
    if (!accessToken) return;
    setMyListingsLoading(true);
    try {
      const [listingsRes, quotaRes] = await Promise.allSettled([
        apiGet<ApiEnvelope<ListingPage>>(`/api/v1/marketplace/me/listings?page=${myListingsPage}&limit=20`, {
          token: accessToken,
        }),
        apiGet<ApiEnvelope<Quota>>("/api/v1/marketplace/me/quota", { token: accessToken }),
      ]);

      if (listingsRes.status === "fulfilled") {
        setMyListings(listingsRes.value.data.items);
        setMyListingsPagination(listingsRes.value.data.pagination);
      } else {
        handleApiError(listingsRes.reason);
      }

      if (quotaRes.status === "fulfilled") {
        setQuota(quotaRes.value.data);
      }
    } finally {
      setMyListingsLoading(false);
    }
  }, [accessToken, handleApiError, myListingsPage]);

  // Load Sales & Purchases
  const loadTransactions = useCallback(async () => {
    if (!accessToken) return;
    setTxLoading(true);
    try {
      const [salesRes, purchasesRes] = await Promise.all([
        apiGet<ApiEnvelope<SaleTransaction[]>>("/api/v1/marketplace/me/sales", { token: accessToken }),
        apiGet<ApiEnvelope<SaleTransaction[]>>("/api/v1/marketplace/me/purchases", { token: accessToken }),
      ]);
      setSales(salesRes.data);
      setPurchases(purchasesRes.data);
    } catch (error) {
      handleApiError(error);
    } finally {
      setTxLoading(false);
    }
  }, [accessToken, handleApiError]);

  // Load My Reports
  const loadMyReports = useCallback(async () => {
    if (!accessToken) return;
    setReportsLoading(true);
    try {
      const res = await apiGet<ApiEnvelope<Report[]>>("/api/v1/marketplace/me/reports", { token: accessToken });
      setMyReports(res.data);
    } catch (error) {
      handleApiError(error);
    } finally {
      setReportsLoading(false);
    }
  }, [accessToken, handleApiError]);

  // Load Admin Reports Queue
  const loadAdminReports = useCallback(async () => {
    setAdminReportsLoading(true);
    try {
      const query = adminReportStatusFilter === "ALL" ? "" : `?status=${adminReportStatusFilter}`;
      const res = await apiGet<ApiEnvelope<Report[]>>(`/api/v1/marketplace/admin/reports${query}`, {
        token: accessToken,
      });
      setAdminReports(res.data);
    } catch (error) {
      handleApiError(error);
    } finally {
      setAdminReportsLoading(false);
    }
  }, [accessToken, adminReportStatusFilter, handleApiError]);

  useEffect(() => {
    if (activeTab === "my-listings" && accessToken) {
      void loadMyListingsAndQuota();
    } else if (activeTab === "transactions" && accessToken) {
      void loadTransactions();
    } else if (activeTab === "reports" && accessToken) {
      void loadMyReports();
    }
  }, [activeTab, accessToken, loadMyListingsAndQuota, loadTransactions, loadMyReports]);

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
      if (!controller.signal.aborted) {
        const formatted = formatApiError(error);
        setDetailError(`${formatted.title}: ${formatted.message}`);
      }
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

  // Public Profile Lookup (`GET /api/v1/users/{userId}`)
  async function openPublicProfile(userId: string) {
    if (!userId.trim()) return;
    setLookupUserId(userId.trim());
    setProfileLoading(true);
    setProfileError("");
    try {
      const res = await apiGet<ApiEnvelope<PublicProfile>>(
        `/api/v1/users/${encodeURIComponent(userId.trim())}`,
      );
      setPublicProfile(res.data);
    } catch (error) {
      setPublicProfile(null);
      const formatted = formatApiError(error);
      setProfileError(`${formatted.title}: ${formatted.message}`);
    } finally {
      setProfileLoading(false);
    }
  }

  // Auth Handlers
  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthLoading(true);
    setBanner(null);
    try {
      const res = await apiPost<ApiEnvelope<TokenPair>>("/api/v1/auth/login", {
        body: { email: loginEmail.trim(), password: loginPassword },
      });
      setAccessToken(res.data.access_token);
      setTokenInput(res.data.access_token);
      setRefreshToken(res.data.refresh_token);
      window.localStorage.setItem("aquaku-refresh-token", res.data.refresh_token);
      setCurrentUser(res.data.user);
      setBanner({
        type: "success",
        title: "Login Berhasil",
        message: `Selamat datang, ${res.data.user.display_name} (${res.data.user.role}).`,
      });
    } catch (error) {
      handleApiError(error);
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthLoading(true);
    setBanner(null);
    try {
      const res = await apiPost<RegisterResponse>("/api/v1/auth/register", {
        body: {
          email: regEmail.trim(),
          password: regPassword,
          display_name: regDisplayName.trim(),
          phone_number: regPhone.trim(),
        },
      });
      if (res.development_otp) {
        setDevOtpHint(res.development_otp);
        setOtpCode(res.development_otp);
      }
      setLoginEmail(regEmail.trim());
      setLoginPassword(regPassword);
      setBanner({
        type: "success",
        title: "Registrasi Berhasil",
        message: res.development_otp
          ? `Akun dibuat. Silakan login lalu verifikasi HP dengan kode OTP development: ${res.development_otp}`
          : "Akun dibuat. Silakan login dan verifikasi nomor HP Anda.",
      });
    } catch (error) {
      handleApiError(error);
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleVerifyPhone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) return;
    setAuthLoading(true);
    try {
      const res = await apiPost<ApiEnvelope<UserProfile>>("/api/v1/auth/verify-phone", {
        token: accessToken,
        body: { code: otpCode.trim() },
      });
      setCurrentUser(res.data);
      setBanner({
        type: "success",
        title: "Nomor HP Terverifikasi",
        message: "Akun Anda kini dapat membuat listing, melakukan konfirmasi transaksi, memberi rating, dan mengirim laporan.",
      });
    } catch (error) {
      handleApiError(error);
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleResendOtp() {
    if (!accessToken) return;
    setAuthLoading(true);
    try {
      const res = await apiPost<ApiEnvelope<OtpResendData>>("/api/v1/auth/otp/resend", {
        token: accessToken,
      });
      if (res.data?.development_otp) {
        setDevOtpHint(res.data.development_otp);
        setOtpCode(res.data.development_otp);
      }
      setBanner({
        type: "info",
        title: "OTP Dikirim Ulang",
        message: res.data?.development_otp
          ? `Kode OTP development: ${res.data.development_otp}`
          : "Kode OTP baru telah dikirim.",
      });
    } catch (error) {
      handleApiError(error);
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleRefreshToken() {
    if (!refreshToken) return;
    setAuthLoading(true);
    try {
      const res = await apiPost<ApiEnvelope<TokenPair>>("/api/v1/auth/refresh", {
        body: { refresh_token: refreshToken },
      });
      setAccessToken(res.data.access_token);
      setTokenInput(res.data.access_token);
      setRefreshToken(res.data.refresh_token);
      window.localStorage.setItem("aquaku-refresh-token", res.data.refresh_token);
      setCurrentUser(res.data.user);
      setBanner({
        type: "success",
        title: "Token Diperbarui",
        message: "Access token baru berhasil diterbitkan.",
      });
    } catch (error) {
      handleApiError(error);
    } finally {
      setAuthLoading(false);
    }
  }

  function handleSaveManualToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleaned = tokenInput.trim().replace(/^Bearer\s+/i, "");
    setAccessToken(cleaned);
    setTokenInput(cleaned);
    setBanner({
      type: "info",
      title: "Access Token Disimpan",
      message: cleaned ? "Bearer token siap digunakan untuk request API." : "Access token telah dihapus (mode publik).",
    });
  }

  function handleLogout() {
    setAccessToken("");
    setRefreshToken("");
    setTokenInput("");
    setCurrentUser(null);
    window.localStorage.removeItem("aquaku-access-token");
    window.localStorage.removeItem("aquaku-refresh-token");
    setBanner({
      type: "info",
      title: "Sesi Diakhiri",
      message: "Anda sekarang mengakses marketplace sebagai pengunjung publik.",
    });
  }

  // Photo Upload (Cloudinary signed upload + confirm-upload)
  async function handleFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !accessToken) return;
    setUploadingPhoto(true);
    setBanner(null);
    try {
      const sigRes = await apiPost<ApiEnvelope<UploadSignatureData>>(
        "/api/v1/marketplace/media/upload-signatures",
        { token: accessToken },
      );
      const sig = sigRes.data;

      const formData = new FormData();
      formData.append("file", file);
      formData.append("api_key", sig.api_key);
      formData.append("timestamp", String(sig.timestamp));
      formData.append("public_id", sig.public_id);
      formData.append("folder", sig.folder);
      formData.append("allowed_formats", sig.allowed_formats);
      formData.append("upload_preset", sig.upload_preset);
      formData.append("overwrite", sig.overwrite);
      formData.append("signature", sig.signature);

      const cloudRes = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloud_name}/image/upload`, {
        method: "POST",
        body: formData,
      });

      if (!cloudRes.ok) {
        throw new Error(`Upload ke Cloudinary gagal (${cloudRes.status}).`);
      }

      await apiPost("/api/v1/marketplace/media/confirm-upload", {
        token: accessToken,
        body: { asset_id: sig.asset_id },
      });

      setFormPhotoIds((current) => [...current, sig.asset_id]);
      setBanner({
        type: "success",
        title: "Foto Terverifikasi",
        message: `Aset foto ${sig.asset_id} berhasil diunggah dan dikonfirmasi.`,
      });
    } catch (error) {
      handleApiError(error);
    } finally {
      setUploadingPhoto(false);
      event.target.value = "";
    }
  }

  async function handleRemovePhotoAsset(assetId: string) {
    if (!accessToken) {
      setFormPhotoIds((current) => current.filter((id) => id !== assetId));
      return;
    }
    try {
      await apiDelete(`/api/v1/marketplace/media/${encodeURIComponent(assetId)}`, { token: accessToken });
      setFormPhotoIds((current) => current.filter((id) => id !== assetId));
      setBanner({
        type: "info",
        title: "Foto Dihapus",
        message: `Aset media ${assetId} dihapus.`,
      });
    } catch (error) {
      // Remove from local array if not yet saved or error
      setFormPhotoIds((current) => current.filter((id) => id !== assetId));
      handleApiError(error);
    }
  }

  // Create or Update Listing (`POST /marketplace/listings` or `PATCH /marketplace/listings/{listingId}`)
  async function handleSubmitListing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) {
      setBanner({
        type: "error",
        title: "401 Unauthorized",
        message: "Silakan login terlebih dahulu untuk membuat atau mengubah listing.",
      });
      setActiveTab("account");
      return;
    }

    const parsedPrice = Number.parseInt(formPrice, 10);
    if (!Number.isFinite(parsedPrice) || parsedPrice < 1) {
      setBanner({
        type: "error",
        title: "400 Bad Request",
        message: "Harga harus berupa angka positif minimal Rp 1.",
      });
      return;
    }

    if (formPhotoIds.length < 1) {
      setBanner({
        type: "error",
        title: "400 Bad Request",
        message: "Minimal 1 photo_id terverifikasi wajib disertakan.",
      });
      return;
    }

    setSubmittingListing(true);
    setBanner(null);
    try {
      if (editingListingId) {
        const res = await apiPatch<ApiEnvelope<Listing>>(
          `/api/v1/marketplace/listings/${encodeURIComponent(editingListingId)}`,
          {
            token: accessToken,
            body: {
              category_id: formCategoryId,
              region_code: formRegionCode,
              title: formTitle.trim(),
              description: formDesc.trim(),
              price: parsedPrice,
              condition: formCondition,
              photo_ids: formPhotoIds,
            },
          },
        );
        setBanner({
          type: "success",
          title: "Listing Diperbarui",
          message: `Listing "${res.data.title}" berhasil diperbarui.`,
        });
      } else {
        const res = await apiPost<ApiEnvelope<Listing>>("/api/v1/marketplace/listings", {
          token: accessToken,
          body: {
            category_id: formCategoryId,
            region_code: formRegionCode,
            title: formTitle.trim(),
            description: formDesc.trim(),
            price: parsedPrice,
            condition: formCondition,
            photo_ids: formPhotoIds,
          },
        });
        setBanner({
          type: "success",
          title: "Listing Dibuat",
          message: `Listing "${res.data.title}" berhasil diterbitkan.`,
        });
      }

      resetListingForm();
      void loadMyListingsAndQuota();
      setReload((c) => c + 1);
    } catch (error) {
      handleApiError(error, () => {
        void loadMyListingsAndQuota();
      });
    } finally {
      setSubmittingListing(false);
    }
  }

  function startEditListing(listing: Listing) {
    setEditingListingId(listing.id);
    setFormTitle(listing.title);
    setFormDesc(listing.description);
    setFormPrice(String(listing.price));
    setFormCategoryId(listing.category.id);
    setFormRegionCode(listing.location.code);
    setFormCondition(listing.condition);
    setFormPhotoIds(listing.photos.map((p) => p.id));
    setActiveTab("my-listings");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetListingForm() {
    setEditingListingId(null);
    setFormTitle("");
    setFormDesc("");
    setFormPrice("");
    setFormCondition("SECOND");
    setFormPhotoIds([]);
    setManualPhotoIdInput("");
  }

  // Mark Listing as Sold (`POST /api/v1/marketplace/listings/{listingId}/sold`)
  async function handleMarkSold(listingId: string) {
    if (!accessToken) return;
    const rawBuyerId = (soldBuyerInputs[listingId] ?? "").trim();
    setBanner(null);
    try {
      const res = await apiPost<ApiEnvelope<MarkSoldData>>(
        `/api/v1/marketplace/listings/${encodeURIComponent(listingId)}/sold`,
        {
          token: accessToken,
          // Sesuai docs.md 3.1: Body boleh tidak dikirim bila tanpa menghubungkan akun pembeli
          body: rawBuyerId ? { buyer_id: rawBuyerId } : undefined,
        },
      );
      setLastMarkSoldResult(res.data);
      setBanner({
        type: "success",
        title: "Listing Ditandai Terjual",
        message: res.data.transaction
          ? `Status: sold. Transaksi ${res.data.transaction.id} menunggu konfirmasi pembeli (${res.data.transaction.buyer_id}).`
          : "Status: sold (transaction: null). Penjualan dicatat tanpa pembeli terhubung.",
      });
      void loadMyListingsAndQuota();
      void loadTransactions();
      setReload((c) => c + 1);
    } catch (error) {
      handleApiError(error, () => {
        void loadMyListingsAndQuota();
        void loadTransactions();
      });
    }
  }

  // Link or Replace Buyer before confirmation (`POST /api/v1/marketplace/listings/{listingId}/sale`)
  async function handleLinkOrReplaceBuyer(listingId: string, buyerIdInput?: string) {
    if (!accessToken) return;
    const buyerId = (buyerIdInput ?? replaceBuyerInputs[listingId] ?? soldBuyerInputs[listingId] ?? "").trim();
    if (!buyerId) {
      setBanner({
        type: "error",
        title: "400 Bad Request",
        message: "Masukkan UUID buyer_id dengan nomor HP terverifikasi.",
      });
      return;
    }
    setBanner(null);
    try {
      const res = await apiPost<ApiEnvelope<SaleTransaction>>(
        `/api/v1/marketplace/listings/${encodeURIComponent(listingId)}/sale`,
        {
          token: accessToken,
          body: { buyer_id: buyerId },
        },
      );
      setBanner({
        type: "success",
        title: "Pembeli Ditautkan / Diganti",
        message: `Transaksi ${res.data.id} kini berstatus ${res.data.status} untuk pembeli ${res.data.buyer.display_name}.`,
      });
      void loadTransactions();
      void loadMyListingsAndQuota();
    } catch (error) {
      handleApiError(error, () => {
        void loadTransactions();
        void loadMyListingsAndQuota();
      });
    }
  }

  // Cancel Awaiting Sale (`DELETE /api/v1/marketplace/sales/{saleId}`)
  async function handleCancelSale(saleId: string) {
    if (!accessToken) return;
    setBanner(null);
    try {
      const res = await apiDelete<ApiEnvelope<SaleTransaction>>(
        `/api/v1/marketplace/sales/${encodeURIComponent(saleId)}`,
        { token: accessToken },
      );
      setBanner({
        type: "info",
        title: "Tautan Transaksi Dibatalkan",
        message: `Transaksi ${res.data.id} dibatalkan (${res.data.status}). Listing tetap berstatus Sold.`,
      });
      void loadTransactions();
      void loadMyListingsAndQuota();
    } catch (error) {
      handleApiError(error, () => {
        void loadTransactions();
      });
    }
  }

  // Buyer Respond to Transaction (`POST /api/v1/marketplace/sales/{saleId}/respond`)
  async function handleRespondSale(saleId: string, decision: BuyerDecision) {
    if (!accessToken) return;
    const note = (respondNotes[saleId] ?? "").trim();
    setBanner(null);
    try {
      const res = await apiPost<ApiEnvelope<SaleTransaction>>(
        `/api/v1/marketplace/sales/${encodeURIComponent(saleId)}/respond`,
        {
          token: accessToken,
          body: note ? { decision, note } : { decision },
        },
      );
      setBanner({
        type: "success",
        title: decision === "CONFIRM" ? "Transaksi Dikonfirmasi" : "Transaksi Ditolak",
        message: `Status transaksi kini: ${res.data.status}.`,
      });
      void loadTransactions();
    } catch (error) {
      handleApiError(error, () => {
        void loadTransactions();
      });
    }
  }

  // Buyer Submit Rating (`POST /api/v1/marketplace/sales/{saleId}/rating`)
  async function handleRateSale(saleId: string) {
    if (!accessToken) return;
    const score = ratingScores[saleId] ?? 5;
    setBanner(null);
    try {
      const res = await apiPost<ApiEnvelope<Rating>>(
        `/api/v1/marketplace/sales/${encodeURIComponent(saleId)}/rating`,
        {
          token: accessToken,
          body: { score },
        },
      );
      setBanner({
        type: "success",
        title: "Rating Tersimpan",
        message: `Rating ${res.data.score}/5 berhasil dicatat untuk transaksi ini.`,
      });
      void loadTransactions();
    } catch (error) {
      handleApiError(error, () => {
        void loadTransactions();
      });
    }
  }

  // Renew / Reactivate / Delete Listing
  async function handleRenewListing(listingId: string) {
    if (!accessToken) return;
    try {
      await apiPost(`/api/v1/marketplace/listings/${encodeURIComponent(listingId)}/renew`, {
        token: accessToken,
      });
      setBanner({ type: "success", title: "Listing Diperpanjang", message: "Listing aktif kembali." });
      void loadMyListingsAndQuota();
      setReload((c) => c + 1);
    } catch (error) {
      handleApiError(error, () => void loadMyListingsAndQuota());
    }
  }

  async function handleReactivateListing(listingId: string) {
    if (!accessToken) return;
    try {
      await apiPost(`/api/v1/marketplace/listings/${encodeURIComponent(listingId)}/reactivate`, {
        token: accessToken,
      });
      setBanner({ type: "success", title: "Listing Diaktifkan Kembali", message: "Listing kembali aktif." });
      void loadMyListingsAndQuota();
      setReload((c) => c + 1);
    } catch (error) {
      handleApiError(error, () => void loadMyListingsAndQuota());
    }
  }

  async function handleDeleteListing(listingId: string) {
    if (!accessToken) return;
    try {
      await apiDelete(`/api/v1/marketplace/listings/${encodeURIComponent(listingId)}`, {
        token: accessToken,
      });
      setBanner({ type: "info", title: "Listing Diarsipkan", message: "Listing telah dihapus (soft delete)." });
      void loadMyListingsAndQuota();
      setReload((c) => c + 1);
    } catch (error) {
      handleApiError(error, () => void loadMyListingsAndQuota());
    }
  }

  // Create Report (`POST /api/v1/marketplace/reports`)
  async function handleCreateReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) {
      setBanner({
        type: "error",
        title: "401 Unauthorized",
        message: "Silakan login dengan akun terverifikasi untuk membuat laporan.",
      });
      setActiveTab("account");
      return;
    }
    setSubmittingReport(true);
    setBanner(null);
    try {
      const res = await apiPost<ApiEnvelope<Report>>("/api/v1/marketplace/reports", {
        token: accessToken,
        body: {
          target_type: reportTargetType,
          target_id: reportTargetId.trim(),
          reason: reportReason,
          ...(reportDetails.trim() ? { details: reportDetails.trim() } : {}),
        },
      });
      setBanner({
        type: "success",
        title: "Laporan Terkirim",
        message: `Laporan ${res.data.id} berstatus "${res.data.status}" dan masuk antrean admin.`,
      });
      setReportDetails("");
      void loadMyReports();
    } catch (error) {
      handleApiError(error, () => {
        void loadMyReports();
      });
    } finally {
      setSubmittingReport(false);
    }
  }

  function prefillReport(targetType: ReportTargetType, targetId: string) {
    setReportTargetType(targetType);
    setReportTargetId(targetId);
    setSelectedListing(null);
    setActiveTab("reports");
  }

  // Admin: Review Report (`POST /api/v1/marketplace/admin/reports/{reportId}/review`)
  async function handleAdminReviewReport(reportId: string) {
    const decision = adminReviewDecision[reportId] ?? "RESOLVED";
    const reviewNote = (adminReviewNotes[reportId] ?? "").trim();
    if (!reviewNote) {
      setBanner({
        type: "error",
        title: "400 Bad Request",
        message: "Catatan review (review_note) wajib diisi saat meninjau laporan.",
      });
      return;
    }
    setBanner(null);
    try {
      const res = await apiPost<ApiEnvelope<Report>>(
        `/api/v1/marketplace/admin/reports/${encodeURIComponent(reportId)}/review`,
        {
          token: accessToken,
          body: { decision, review_note: reviewNote },
        },
      );
      setBanner({
        type: "success",
        title: "Laporan Ditinjau",
        message: `Laporan ${res.data.id} diperbarui menjadi "${res.data.status}".`,
      });
      void loadAdminReports();
    } catch (error) {
      handleApiError(error, () => {
        void loadAdminReports();
      });
    }
  }

  // Admin: Listing Moderation (`GET` & `POST /api/v1/marketplace/admin/listings/{listingId}/moderation`)
  async function handleLoadModerationHistory(listingIdToLoad?: string) {
    const targetId = (listingIdToLoad ?? modListingId).trim();
    if (!targetId) return;
    setModLoading(true);
    try {
      const res = await apiGet<ApiEnvelope<ModerationAction[]>>(
        `/api/v1/marketplace/admin/listings/${encodeURIComponent(targetId)}/moderation`,
        { token: accessToken },
      );
      setModHistory(res.data);
    } catch (error) {
      handleApiError(error);
    } finally {
      setModLoading(false);
    }
  }

  async function handleModerateListing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const targetId = modListingId.trim();
    if (!targetId || !modReason.trim()) {
      setBanner({
        type: "error",
        title: "400 Bad Request",
        message: "Listing ID dan alasan moderasi (reason) wajib diisi.",
      });
      return;
    }
    setModLoading(true);
    setBanner(null);
    try {
      const res = await apiPost<ApiEnvelope<ModerationResult>>(
        `/api/v1/marketplace/admin/listings/${encodeURIComponent(targetId)}/moderation`,
        {
          token: accessToken,
          body: { action: modAction, reason: modReason.trim() },
        },
      );
      setModResult(res.data);
      setModReason("");
      setBanner({
        type: "success",
        title: modAction === "HIDE" ? "Listing Disembunyikan" : "Listing Dipulihkan",
        message: `Listing ${res.data.id} sekarang hidden=${String(res.data.hidden)}.`,
      });
      await handleLoadModerationHistory(targetId);
      setReload((c) => c + 1);
    } catch (error) {
      handleApiError(error, () => {
        void handleLoadModerationHistory(targetId);
      });
    } finally {
      setModLoading(false);
    }
  }

  // Admin: Buyer Correction (`POST /api/v1/marketplace/admin/sales/{saleId}/correct-buyer` & `GET .../corrections`)
  async function handleLoadSaleCorrections(saleIdToLoad?: string) {
    const targetSaleId = (saleIdToLoad ?? correctSaleId).trim();
    if (!targetSaleId) return;
    setCorrectionsLoading(true);
    try {
      const res = await apiGet<ApiEnvelope<SaleCorrection[]>>(
        `/api/v1/marketplace/admin/sales/${encodeURIComponent(targetSaleId)}/corrections`,
        { token: accessToken },
      );
      setSaleCorrections(res.data);
    } catch (error) {
      handleApiError(error);
    } finally {
      setCorrectionsLoading(false);
    }
  }

  async function handleCorrectBuyer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const targetSaleId = correctSaleId.trim();
    if (!targetSaleId || !correctBuyerId.trim() || !correctReason.trim()) {
      setBanner({
        type: "error",
        title: "400 Bad Request",
        message: "Sale ID, Buyer ID baru, dan alasan koreksi wajib diisi.",
      });
      return;
    }
    setCorrectionsLoading(true);
    setBanner(null);
    try {
      const res = await apiPost<ApiEnvelope<SaleTransaction>>(
        `/api/v1/marketplace/admin/sales/${encodeURIComponent(targetSaleId)}/correct-buyer`,
        {
          token: accessToken,
          body: {
            buyer_id: correctBuyerId.trim(),
            reason: correctReason.trim(),
          },
        },
      );
      setCorrectReason("");
      setBanner({
        type: "success",
        title: "Pembeli Dikoreksi",
        message: `Rating lama dihapus dan transaksi ${res.data.id} kembali ke status "${res.data.status}" untuk pembeli ${res.data.buyer.display_name}.`,
      });
      await handleLoadSaleCorrections(targetSaleId);
    } catch (error) {
      handleApiError(error, () => {
        void handleLoadSaleCorrections(targetSaleId);
      });
    } finally {
      setCorrectionsLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a
          className="brand"
          href="#explore"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab("explore");
          }}
          aria-label="Aquaku beranda"
        >
          <span className="brand-mark">
            <img src="/icon.jpeg" alt="" width="40" height="40" />
          </span>
          <span className="brand-copy">
            Aquaku<small>marketplace aquascape</small>
          </span>
        </a>

        <nav className="nav" aria-label="Navigasi utama">
          <button
            type="button"
            className={`nav-link ${activeTab === "explore" ? "active" : ""}`}
            onClick={() => setActiveTab("explore")}
          >
            <Icon name="market" />
            <span>Jelajah</span>
          </button>
          <button
            type="button"
            className={`nav-link ${activeTab === "my-listings" ? "active" : ""}`}
            onClick={() => setActiveTab("my-listings")}
          >
            <Icon name="box" />
            <span>Listing Saya</span>
          </button>
          <button
            type="button"
            className={`nav-link ${activeTab === "transactions" ? "active" : ""}`}
            onClick={() => setActiveTab("transactions")}
          >
            <Icon name="swap" />
            <span>Transaksi & Rating</span>
          </button>
          <button
            type="button"
            className={`nav-link ${activeTab === "reports" ? "active" : ""}`}
            onClick={() => setActiveTab("reports")}
          >
            <Icon name="flag" />
            <span>Laporan</span>
          </button>
          <button
            type="button"
            className={`nav-link ${activeTab === "admin" ? "active" : ""}`}
            onClick={() => setActiveTab("admin")}
          >
            <Icon name="shield" />
            <span>Admin</span>
          </button>
          <button
            type="button"
            className={`nav-link ${activeTab === "account" ? "active" : ""}`}
            onClick={() => setActiveTab("account")}
          >
            <Icon name="user" />
            <span>{currentUser ? currentUser.display_name : "Akun / Token"}</span>
          </button>
        </nav>

        <div className="top-actions">
          {currentUser ? (
            <button
              type="button"
              className="user-badge-btn"
              onClick={() => setActiveTab("account")}
              title={`ID: ${currentUser.id}`}
            >
              <span className={`status-dot ${currentUser.phone_verified ? "verified" : "unverified"}`} />
              <span>{currentUser.display_name}</span>
              <small className="role-chip">{currentUser.role}</small>
            </button>
          ) : (
            <button type="button" className="button-secondary compact-btn" onClick={() => setActiveTab("account")}>
              Login / Token
            </button>
          )}
          <button
            className="theme-toggle"
            type="button"
            aria-label={theme === "dark" ? "Aktifkan mode terang" : "Aktifkan mode gelap"}
            aria-pressed={theme === "dark"}
            onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
          >
            <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
            <span className="theme-label">Mode</span>
          </button>
          <span className="location-pill">
            <Icon name="pin" /> Semarang
          </span>
        </div>
      </header>

      <main className="main-content">
        {banner && (
          <div className={`alert-banner ${banner.type}`} role="alert">
            <div>
              <strong>
                {banner.title}
                {banner.code ? ` (${banner.code})` : ""}
              </strong>
              <p>{banner.message}</p>
            </div>
            <button type="button" className="banner-close" onClick={() => setBanner(null)} aria-label="Tutup pesan">
              ×
            </button>
          </div>
        )}

        {currentUser && !currentUser.phone_verified && (
          <div className="notice warning" role="status">
            <strong>Nomor HP belum terverifikasi.</strong> Tindakan membuat listing, mencatat/merespons transaksi,
            memberi rating, dan mengirim laporan memerlukan verifikasi OTP di tab{" "}
            <button type="button" className="inline-link" onClick={() => setActiveTab("account")}>
              Akun / Token
            </button>
            .
          </div>
        )}

        {/* ==================== TAB 1: JELAJAH & PROFIL PUBLIK ==================== */}
        {activeTab === "explore" && (
          <>
            <section className="intro">
              <div>
                <p className="eyebrow">Jual beli lokal, tumbuh bareng</p>
                <h1>Temukan isi tank-mu</h1>
                <p className="subtitle">
                  Tanaman, fauna, dan perlengkapan aquascape dari sekitar Kota Semarang. Tanpa komisi transaksi.
                </p>
              </div>
              <div className="local-note">
                <span className="online-dot" /> Listing aktif di Semarang
              </div>
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
                    {categories.map((category) => (
                      <option key={category.id} value={category.slug}>
                        {category.name}
                      </option>
                    ))}
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
                    {districts.map(([code, name]) => (
                      <option key={code} value={code}>
                        {name}
                      </option>
                    ))}
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
                    {visibleRegions.map((region) => (
                      <option key={region.code} value={region.code}>
                        {region.kelurahan}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Harga minimum</span>
                  <input
                    type="number"
                    min="1"
                    placeholder="Rp minimum"
                    value={filters.minPrice}
                    onChange={(event) => updateFilter("minPrice", event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Harga maksimum</span>
                  <input
                    type="number"
                    min="1"
                    placeholder="Rp maksimum"
                    value={filters.maxPrice}
                    onChange={(event) => updateFilter("maxPrice", event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Urutkan</span>
                  <select
                    value={filters.sort}
                    onChange={(event) => updateFilter("sort", event.target.value as Filters["sort"])}
                  >
                    <option value="newest">Terbaru</option>
                    <option value="price_asc">Harga terendah</option>
                    <option value="price_desc">Harga tertinggi</option>
                  </select>
                </label>
              </div>

              <div className="filter-actions">
                <button type="button" className="button-secondary" onClick={resetFilters}>
                  Reset filter
                </button>
                <button type="submit" className="button-primary">
                  <Icon name="search" /> Tampilkan hasil
                </button>
              </div>
            </form>

            {/* Panel Cek Profil Publik Penjual / Pengguna */}
            <section className="section-card compact-card">
              <div className="card-header-inline">
                <div>
                  <h3>Profil Publik & Ringkasan Rating Penjual (`GET /users/&#123;userId&#125;`)</h3>
                  <p className="muted-text">
                    Dapat diakses publik tanpa login. Klik nama penjual pada listing atau masukkan UUID pengguna.
                  </p>
                </div>
                <form
                  className="inline-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void openPublicProfile(lookupUserId);
                  }}
                >
                  <input
                    type="text"
                    placeholder="Masukkan User UUID..."
                    value={lookupUserId}
                    onChange={(e) => setLookupUserId(e.target.value)}
                  />
                  <button type="submit" className="button-secondary" disabled={profileLoading}>
                    {profileLoading ? "Memuat..." : "Lihat Profil"}
                  </button>
                </form>
              </div>

              {profileError && <p className="error-text">{profileError}</p>}

              {publicProfile && (
                <div className="profile-summary-box">
                  <div className="profile-summary-main">
                    <div>
                      <strong>{publicProfile.display_name}</strong>{" "}
                      <span className="condition-tag">{publicProfile.tier.toUpperCase()}</span>{" "}
                      {publicProfile.verified_store && <span className="verified-tag">✓ Toko Terverifikasi</span>}
                      <p className="muted-text">UUID: {publicProfile.id}</p>
                      {publicProfile.bio && <p className="profile-bio">{publicProfile.bio}</p>}
                    </div>
                    <div className="profile-stats">
                      <div className="stat-item">
                        <small>Rating Rata-rata</small>
                        <strong>
                          {publicProfile.rating_average !== null ? `★ ${publicProfile.rating_average.toFixed(2)}` : "Belum ada"}
                        </strong>
                      </div>
                      <div className="stat-item">
                        <small>Jumlah Rating</small>
                        <strong>{publicProfile.rating_count} ulasan</strong>
                      </div>
                      <div className="stat-item">
                        <small>Listing Aktif</small>
                        <strong>{publicProfile.active_listing_count}</strong>
                      </div>
                    </div>
                  </div>
                  <div className="action-row">
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => prefillReport("USER", publicProfile.id)}
                    >
                      Laporkan Pengguna Ini
                    </button>
                    <button type="button" className="button-secondary" onClick={() => setPublicProfile(null)}>
                      Tutup Profil
                    </button>
                  </div>
                </div>
              )}
            </section>

            {referenceError && (
              <p className="notice warning" role="status">
                {referenceError} Filter terkait mungkin belum tersedia.
              </p>
            )}

            <div className="results-heading">
              <div>
                <h2>Listing sekitar Semarang</h2>
                <p>{loading ? "Memuat listing..." : `${pagination.total} listing aktif ditemukan`}</p>
              </div>
              <span className="result-page">
                {pagination.pages > 0 ? `Halaman ${pagination.page} dari ${pagination.pages}` : "Tanpa komisi transaksi"}
              </span>
            </div>

            {listError ? (
              <div className="error-state" role="alert">
                <span className="error-icon">!</span>
                <h3>Listing belum dapat dimuat</h3>
                <p>{listError}</p>
                <button
                  className="button-secondary"
                  type="button"
                  onClick={() => setReload((current) => current + 1)}
                >
                  Coba lagi
                </button>
              </div>
            ) : loading ? (
              <div className="listing-grid" aria-label="Memuat listing">
                {Array.from({ length: 6 }, (_, index) => (
                  <div className="skeleton-card" key={index}>
                    <div />
                    <span />
                    <span />
                  </div>
                ))}
              </div>
            ) : listings.length ? (
              <div className="listing-grid">
                {listings.map((listing) => (
                  <ListingCard key={listing.id} listing={listing} onOpen={() => void openListing(listing)} />
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <span>🪴</span>
                <h3>Belum ada listing yang cocok</h3>
                <p>Coba ubah kata kunci atau filter pencarianmu.</p>
                <button className="button-secondary" type="button" onClick={resetFilters}>
                  Hapus semua filter
                </button>
              </div>
            )}

            {!listError && pagination.pages > 1 && (
              <nav className="pagination" aria-label="Halaman listing">
                <button
                  type="button"
                  className="button-secondary"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((current) => current - 1)}
                >
                  Sebelumnya
                </button>
                <span>
                  {pagination.page} / {pagination.pages}
                </span>
                <button
                  type="button"
                  className="button-secondary"
                  disabled={page >= pagination.pages || loading}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Berikutnya
                </button>
              </nav>
            )}
          </>
        )}

        {/* ==================== TAB 2: LISTING SAYA & BUAT/EDIT LISTING ==================== */}
        {activeTab === "my-listings" && (
          <div className="stack-layout">
            <section className="section-card">
              <div className="card-header-inline">
                <div>
                  <h2>{editingListingId ? `Ubah Listing (${editingListingId})` : "Buat Listing Baru"}</h2>
                  <p className="muted-text">
                    Endpoint: <code>{editingListingId ? "PATCH /marketplace/listings/{listingId}" : "POST /marketplace/listings"}</code> (Wajib Login & HP Terverifikasi)
                  </p>
                </div>
                {quota && (
                  <div className="quota-pills">
                    <span className="condition-tag">Tier: {quota.tier.toUpperCase()}</span>
                    <span className="verified-tag">
                      Slot Tersedia: {quota.available_slots} / {quota.total_quota} (Aktif: {quota.active_listings})
                    </span>
                  </div>
                )}
              </div>

              {tags.length > 0 && (
                <p className="muted-text small-note">
                  Ketentuan Kondisi: {tags.map((t) => `${t.name} (min. ${t.minimum_tier})`).join(" · ")}
                </p>
              )}

              <form className="form-grid" onSubmit={handleSubmitListing}>
                <label className="field span-2">
                  <span>Judul Listing (5–120 karakter)</span>
                  <input
                    type="text"
                    required
                    minLength={5}
                    maxLength={120}
                    placeholder="Contoh: Anubias Nana Petite Rimbun Sehat"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                  />
                </label>

                <label className="field">
                  <span>Kategori</span>
                  <select
                    required
                    value={formCategoryId}
                    onChange={(e) => setFormCategoryId(e.target.value)}
                  >
                    <option value="">Pilih kategori</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Kelurahan (Kota Semarang)</span>
                  <select
                    required
                    value={formRegionCode}
                    onChange={(e) => setFormRegionCode(e.target.value)}
                  >
                    <option value="">Pilih kelurahan</option>
                    {regions.map((reg) => (
                      <option key={reg.code} value={reg.code}>
                        {reg.district} — {reg.kelurahan} ({reg.code})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Harga (IDR)</span>
                  <input
                    type="number"
                    required
                    min={1}
                    placeholder="Contoh: 75000"
                    value={formPrice}
                    onChange={(e) => setFormPrice(e.target.value)}
                  />
                </label>

                <label className="field">
                  <span>Kondisi (`Condition`)</span>
                  <select
                    value={formCondition}
                    onChange={(e) => setFormCondition(e.target.value as Condition)}
                  >
                    <option value="SECOND">SECOND</option>
                    <option value="LIKE_NEW">LIKE_NEW</option>
                    <option value="NEW">NEW</option>
                    <option value="BNIB">BNIB</option>
                  </select>
                </label>

                <label className="field span-2">
                  <span>Deskripsi (10–5000 karakter)</span>
                  <textarea
                    required
                    minLength={10}
                    maxLength={5000}
                    rows={4}
                    placeholder="Jelaskan kondisi tanaman/fauna/alat, ukuran, dan lokasi COD..."
                    value={formDesc}
                    onChange={(e) => setFormDesc(e.target.value)}
                  />
                </label>

                <div className="field span-2">
                  <span>Foto Terverifikasi (`photo_ids` — 1 s/d 8 foto)</span>
                  <div className="photo-upload-box">
                    <div className="inline-form">
                      <label className="button-secondary file-label">
                        {uploadingPhoto ? "Mengunggah ke Cloudinary..." : "Unggah Foto (Cloudinary)"}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          disabled={uploadingPhoto}
                          onChange={handleFileUpload}
                          hidden
                        />
                      </label>
                      <input
                        type="text"
                        placeholder="Atau tambah UUID asset_id terverifikasi..."
                        value={manualPhotoIdInput}
                        onChange={(e) => setManualPhotoIdInput(e.target.value)}
                      />
                      <button
                        type="button"
                        className="button-secondary"
                        onClick={() => {
                          const trimmed = manualPhotoIdInput.trim();
                          if (trimmed && !formPhotoIds.includes(trimmed)) {
                            setFormPhotoIds((curr) => [...curr, trimmed]);
                            setManualPhotoIdInput("");
                          }
                        }}
                      >
                        Tambah ID
                      </button>
                    </div>
                    {formPhotoIds.length > 0 ? (
                      <div className="chip-list">
                        {formPhotoIds.map((id) => (
                          <span key={id} className="asset-chip">
                            <code>{id}</code>
                            <button
                              type="button"
                              onClick={() => void handleRemovePhotoAsset(id)}
                              title="Hapus aset foto"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <small className="muted-text">
                        Belum ada foto. Unggah melalui signed upload Cloudinary (mengembalikan 503 bila kredensial Cloudinary belum diset) atau masukkan UUID aset terverifikasi.
                      </small>
                    )}
                  </div>
                </div>

                <div className="filter-actions span-2">
                  {editingListingId && (
                    <button type="button" className="button-secondary" onClick={resetListingForm}>
                      Batal Edit
                    </button>
                  )}
                  <button type="submit" className="button-primary" disabled={submittingListing}>
                    {submittingListing
                      ? "Menyimpan..."
                      : editingListingId
                        ? "Simpan Perubahan Listing"
                        : "Terbitkan Listing"}
                  </button>
                </div>
              </form>
            </section>

            {lastMarkSoldResult && (
              <section className="section-card compact-card">
                <div className="card-header-inline">
                  <div>
                    <h3>Response Terakhir `POST /marketplace/listings/&#123;listingId&#125;/sold`</h3>
                    <p className="muted-text">
                      Sesuai bagian 3.1 panduan: jika tanpa <code>buyer_id</code>, <code>transaction</code> bernilai{" "}
                      <code>null</code>.
                    </p>
                  </div>
                  <button type="button" className="button-secondary" onClick={() => setLastMarkSoldResult(null)}>
                    Tutup
                  </button>
                </div>
                <pre className="code-preview">{JSON.stringify({ data: lastMarkSoldResult }, null, 2)}</pre>
              </section>
            )}

            <section className="section-card">
              <div className="card-header-inline">
                <div>
                  <h2>Daftar Listing Milik Sendiri (`GET /marketplace/me/listings`)</h2>
                  <p className="muted-text">
                    Menampilkan semua listing milik sendiri termasuk status <code>active</code>, <code>sold</code>,{" "}
                    <code>expired</code>, dan <code>inactive</code>.
                  </p>
                </div>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => void loadMyListingsAndQuota()}
                  disabled={myListingsLoading}
                >
                  {myListingsLoading ? "Memuat..." : "Refresh"}
                </button>
              </div>

              {!accessToken ? (
                <div className="empty-state">
                  <p>Silakan login atau masukkan Bearer token pada tab Akun untuk melihat listing milik sendiri.</p>
                  <button type="button" className="button-primary" onClick={() => setActiveTab("account")}>
                    Buka Akun / Token
                  </button>
                </div>
              ) : myListings.length === 0 ? (
                <div className="empty-state">
                  <p>{myListingsLoading ? "Memuat listing..." : "Anda belum memiliki listing."}</p>
                </div>
              ) : (
                <div className="stack-list">
                  {myListings.map((item) => (
                    <article key={item.id} className="item-row-card">
                      <div className="item-row-header">
                        <div>
                          <div className="listing-tags">
                            <span className={`status-badge status-${item.status}`}>
                              {LISTING_STATUS_LABELS[item.status]}
                            </span>
                            <span className="condition-tag">{CONDITION_LABELS[item.condition]}</span>
                            {item.moderation_hidden_at && (
                              <span className="status-badge status-rejected">
                                Disembunyikan Admin ({item.moderation_reason || "Dalam moderasi"})
                              </span>
                            )}
                          </div>
                          <h3>{item.title}</h3>
                          <p className="muted-text">
                            ID: <code>{item.id}</code> · {formatPrice(item.price)} · {item.category.name} ·{" "}
                            {item.location.kelurahan}
                          </p>
                        </div>
                        <div className="action-row">
                          {item.status === "active" && (
                            <button
                              type="button"
                              className="button-secondary"
                              onClick={() => startEditListing(item)}
                            >
                              Ubah (`PATCH`)
                            </button>
                          )}
                          {item.status === "expired" && (
                            <button
                              type="button"
                              className="button-secondary"
                              onClick={() => void handleRenewListing(item.id)}
                            >
                              Perpanjang (`renew`)
                            </button>
                          )}
                          {item.status === "inactive" && (
                            <button
                              type="button"
                              className="button-secondary"
                              onClick={() => void handleReactivateListing(item.id)}
                            >
                              Aktifkan (`reactivate`)
                            </button>
                          )}
                          {item.status !== "sold" && (
                            <button
                              type="button"
                              className="button-secondary danger-btn"
                              onClick={() => void handleDeleteListing(item.id)}
                            >
                              Arsipkan
                            </button>
                          )}
                        </div>
                      </div>

                      {item.status === "active" && (
                        <div className="sub-action-box">
                          <strong>3.1 Tandai Listing Terjual (`POST /marketplace/listings/{item.id}/sold`)</strong>
                          <p className="muted-text">
                            Kosongkan Buyer UUID untuk mencatat terjual tanpa pembeli (<code>transaction: null</code>),
                            atau isi Buyer UUID terverifikasi untuk memulai transaksi <code>awaiting_confirmation</code>.
                          </p>
                          <div className="inline-form">
                            <input
                              type="text"
                              placeholder="Opsional: Buyer User UUID (HP terverifikasi)..."
                              value={soldBuyerInputs[item.id] ?? ""}
                              onChange={(e) =>
                                setSoldBuyerInputs((curr) => ({ ...curr, [item.id]: e.target.value }))
                              }
                            />
                            <button
                              type="button"
                              className="button-primary"
                              onClick={() => void handleMarkSold(item.id)}
                            >
                              Tandai Terjual
                            </button>
                          </div>
                        </div>
                      )}

                      {item.status === "sold" && (
                        <div className="sub-action-box">
                          <strong>3.2 Tautkan / Ganti Pembeli (`POST /marketplace/listings/{item.id}/sale`)</strong>
                          <p className="muted-text">
                            Gunakan sebelum pembeli mengonfirmasi, atau setelah pembeli menolak / tautan sebelumnya
                            dibatalkan. Listing tetap berstatus Sold.
                          </p>
                          <div className="inline-form">
                            <input
                              type="text"
                              placeholder="Buyer User UUID baru (HP terverifikasi)..."
                              value={replaceBuyerInputs[item.id] ?? ""}
                              onChange={(e) =>
                                setReplaceBuyerInputs((curr) => ({ ...curr, [item.id]: e.target.value }))
                              }
                            />
                            <button
                              type="button"
                              className="button-secondary"
                              onClick={() => void handleLinkOrReplaceBuyer(item.id)}
                            >
                              Tautkan / Ganti Pembeli
                            </button>
                          </div>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}

              {myListingsPagination.pages > 1 && (
                <nav className="pagination" aria-label="Halaman listing saya">
                  <button
                    type="button"
                    className="button-secondary"
                    disabled={myListingsPage <= 1 || myListingsLoading}
                    onClick={() => setMyListingsPage((p) => p - 1)}
                  >
                    Sebelumnya
                  </button>
                  <span>
                    {myListingsPagination.page} / {myListingsPagination.pages}
                  </span>
                  <button
                    type="button"
                    className="button-secondary"
                    disabled={myListingsPage >= myListingsPagination.pages || myListingsLoading}
                    onClick={() => setMyListingsPage((p) => p + 1)}
                  >
                    Berikutnya
                  </button>
                </nav>
              )}
            </section>
          </div>
        )}

        {/* ==================== TAB 3: TRANSAKSI & RATING ==================== */}
        {activeTab === "transactions" && (
          <div className="stack-layout">
            <div className="card-header-inline">
              <div>
                <h2>Alur Transaksi & Rating</h2>
                <p className="muted-text">
                  Kelola konfirmasi pembelian (<code>CONFIRM</code> / <code>REJECT</code>), pemberian rating 1–5 pada
                  transaksi <code>confirmed</code>, serta pembatalan atau penggantian pembeli oleh penjual.
                </p>
              </div>
              <button
                type="button"
                className="button-secondary"
                onClick={() => void loadTransactions()}
                disabled={txLoading}
              >
                {txLoading ? "Memuat..." : "Refresh Riwayat"}
              </button>
            </div>

            {!accessToken ? (
              <div className="empty-state">
                <p>Silakan login terlebih dahulu untuk melihat riwayat pembelian dan penjualan terhubung.</p>
                <button type="button" className="button-primary" onClick={() => setActiveTab("account")}>
                  Buka Akun / Token
                </button>
              </div>
            ) : (
              <>
                {/* PEMBELIAN SAYA (BUYER) */}
                <section className="section-card">
                  <h3>Riwayat Pembelian Terhubung (`GET /marketplace/me/purchases`)</h3>
                  <p className="muted-text">
                    Sebagai pembeli yang ditautkan, Anda dapat mengonfirmasi atau menolak transaksi{" "}
                    <code>awaiting_confirmation</code>, dan memberi rating 1–5 setelah <code>confirmed</code>.
                  </p>

                  {purchases.length === 0 ? (
                    <div className="empty-state">
                      <p>{txLoading ? "Memuat pembelian..." : "Belum ada transaksi pembelian yang ditautkan ke akun Anda."}</p>
                    </div>
                  ) : (
                    <div className="stack-list">
                      {purchases.map((tx) => (
                        <article key={tx.id} className="item-row-card">
                          <div className="item-row-header">
                            <div>
                              <span className={`status-badge status-${tx.status}`}>
                                {TRANSACTION_STATUS_LABELS[tx.status]} ({tx.status})
                              </span>
                              <h3>{tx.listing.title}</h3>
                              <p className="muted-text">
                                Sale ID: <code>{tx.id}</code> · Listing ID: <code>{tx.listing.id}</code> · Harga:{" "}
                                <strong>{formatPrice(tx.listing.price)}</strong>
                              </p>
                              <p className="muted-text">
                                Penjual:{" "}
                                <button
                                  type="button"
                                  className="inline-link"
                                  onClick={() => {
                                    setActiveTab("explore");
                                    void openPublicProfile(tx.seller.id);
                                  }}
                                >
                                  {tx.seller.display_name} ({tx.seller.id})
                                </button>{" "}
                                · Dibuat: {formatDate(tx.created_at)}
                              </p>
                              {tx.response_note && (
                                <p className="muted-text">Catatan Respons: &ldquo;{tx.response_note}&rdquo;</p>
                              )}
                            </div>
                          </div>

                          {tx.status === "awaiting_confirmation" && (
                            <div className="sub-action-box">
                              <strong>3.2 Konfirmasi atau Tolak Transaksi (`POST /marketplace/sales/{tx.id}/respond`)</strong>
                              <div className="inline-form">
                                <input
                                  type="text"
                                  maxLength={500}
                                  placeholder="Catatan opsional (maks. 500 karakter)..."
                                  value={respondNotes[tx.id] ?? ""}
                                  onChange={(e) =>
                                    setRespondNotes((curr) => ({ ...curr, [tx.id]: e.target.value }))
                                  }
                                />
                                <button
                                  type="button"
                                  className="button-primary"
                                  onClick={() => void handleRespondSale(tx.id, "CONFIRM")}
                                >
                                  Konfirmasi (`CONFIRM`)
                                </button>
                                <button
                                  type="button"
                                  className="button-secondary danger-btn"
                                  onClick={() => void handleRespondSale(tx.id, "REJECT")}
                                >
                                  Tolak (`REJECT`)
                                </button>
                              </div>
                            </div>
                          )}

                          {tx.status === "confirmed" && (
                            <div className="sub-action-box">
                              <strong>3.3 Beri Rating Penjual (`POST /marketplace/sales/{tx.id}/rating`)</strong>
                              {tx.rating ? (
                                <p className="muted-text">
                                  Rating tercatat: <strong>★ {tx.rating.score} / 5</strong> pada{" "}
                                  {formatDate(tx.rating.created_at)}. Mengirim ulang skor yang sama bersifat idempoten;
                                  mengubah skor menghasilkan <code>409 Conflict</code>.
                                </p>
                              ) : (
                                <p className="muted-text">
                                  Pilih skor 1–5 untuk transaksi terkonfirmasi ini (hanya 1 rating per transaksi).
                                </p>
                              )}
                              <div className="inline-form">
                                <select
                                  value={ratingScores[tx.id] ?? tx.rating?.score ?? 5}
                                  onChange={(e) =>
                                    setRatingScores((curr) => ({
                                      ...curr,
                                      [tx.id]: Number.parseInt(e.target.value, 10),
                                    }))
                                  }
                                >
                                  <option value={5}>5 — Sangat Puas</option>
                                  <option value={4}>4 — Puas</option>
                                  <option value={3}>3 — Cukup</option>
                                  <option value={2}>2 — Kurang</option>
                                  <option value={1}>1 — Buruk</option>
                                </select>
                                <button
                                  type="button"
                                  className="button-primary"
                                  onClick={() => void handleRateSale(tx.id)}
                                >
                                  Kirim Rating
                                </button>
                              </div>
                            </div>
                          )}
                        </article>
                      ))}
                    </div>
                  )}
                </section>

                {/* PENJUALAN SAYA (SELLER) */}
                <section className="section-card">
                  <h3>Riwayat Penjualan Terhubung (`GET /marketplace/me/sales`)</h3>
                  <p className="muted-text">
                    Sebagai penjual, Anda dapat membatalkan tautan yang masih <code>awaiting_confirmation</code> atau
                    menautkan pembeli baru jika ditolak/dibatalkan.
                  </p>

                  {sales.length === 0 ? (
                    <div className="empty-state">
                      <p>{txLoading ? "Memuat penjualan..." : "Belum ada riwayat penjualan terhubung."}</p>
                    </div>
                  ) : (
                    <div className="stack-list">
                      {sales.map((tx) => (
                        <article key={tx.id} className="item-row-card">
                          <div className="item-row-header">
                            <div>
                              <span className={`status-badge status-${tx.status}`}>
                                {TRANSACTION_STATUS_LABELS[tx.status]} ({tx.status})
                              </span>
                              <h3>{tx.listing.title}</h3>
                              <p className="muted-text">
                                Sale ID: <code>{tx.id}</code> · Listing ID: <code>{tx.listing.id}</code> · Harga:{" "}
                                <strong>{formatPrice(tx.listing.price)}</strong>
                              </p>
                              <p className="muted-text">
                                Pembeli: <strong>{tx.buyer.display_name}</strong> (<code>{tx.buyer.id}</code>) ·
                                Dibuat: {formatDate(tx.created_at)}
                              </p>
                              {tx.response_note && (
                                <p className="muted-text">Catatan Pembeli: &ldquo;{tx.response_note}&rdquo;</p>
                              )}
                              {tx.rating && (
                                <p className="muted-text">
                                  Rating Diterima: <strong>★ {tx.rating.score} / 5</strong>
                                </p>
                              )}
                            </div>

                            {tx.status === "awaiting_confirmation" && (
                              <div className="action-row">
                                <button
                                  type="button"
                                  className="button-secondary danger-btn"
                                  onClick={() => void handleCancelSale(tx.id)}
                                >
                                  Batalkan Tautan (`DELETE`)
                                </button>
                              </div>
                            )}
                          </div>

                          {(tx.status === "awaiting_confirmation" ||
                            tx.status === "rejected" ||
                            tx.status === "cancelled") && (
                            <div className="sub-action-box">
                              <strong>
                                {tx.status === "awaiting_confirmation"
                                  ? "Ganti Pembeli Sebelum Konfirmasi"
                                  : "Tautkan Pembeli Baru (Listing Tetap Sold)"}{" "}
                                (`POST /marketplace/listings/{tx.listing.id}/sale`)
                              </strong>
                              <div className="inline-form">
                                <input
                                  type="text"
                                  placeholder="Masukkan Buyer User UUID baru..."
                                  value={replaceBuyerInputs[tx.listing.id] ?? ""}
                                  onChange={(e) =>
                                    setReplaceBuyerInputs((curr) => ({
                                      ...curr,
                                      [tx.listing.id]: e.target.value,
                                    }))
                                  }
                                />
                                <button
                                  type="button"
                                  className="button-secondary"
                                  onClick={() => void handleLinkOrReplaceBuyer(tx.listing.id)}
                                >
                                  Simpan Pembeli Baru
                                </button>
                              </div>
                            </div>
                          )}
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        )}

        {/* ==================== TAB 4: LAPORAN PENGGUNA & LISTING ==================== */}
        {activeTab === "reports" && (
          <div className="stack-layout">
            <section className="section-card">
              <h2>4. Buat Laporan Listing atau Pengguna (`POST /marketplace/reports`)</h2>
              <p className="muted-text">
                Satu pelapor hanya dapat memiliki satu laporan <code>open</code> untuk target yang sama; mengirim
                duplikat saat masih <code>open</code> akan mengembalikan <code>409 Conflict</code>.
              </p>

              <form className="form-grid" onSubmit={handleCreateReport}>
                <label className="field">
                  <span>Target Type (`target_type`)</span>
                  <select
                    value={reportTargetType}
                    onChange={(e) => setReportTargetType(e.target.value as ReportTargetType)}
                  >
                    <option value="LISTING">LISTING</option>
                    <option value="USER">USER</option>
                  </select>
                </label>

                <label className="field">
                  <span>Target UUID (`target_id`)</span>
                  <input
                    type="text"
                    required
                    placeholder="UUID listing atau pengguna..."
                    value={reportTargetId}
                    onChange={(e) => setReportTargetId(e.target.value)}
                  />
                </label>

                <label className="field span-2">
                  <span>Alasan (`reason`)</span>
                  <select
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value as ReportReason)}
                  >
                    {REPORT_REASONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field span-2">
                  <span>Detail Tambahan (`details` — opsional, maks. 1000 karakter)</span>
                  <textarea
                    maxLength={1000}
                    rows={3}
                    placeholder="Jelaskan detail pelanggaran..."
                    value={reportDetails}
                    onChange={(e) => setReportDetails(e.target.value)}
                  />
                </label>

                <div className="filter-actions span-2">
                  <button type="submit" className="button-primary" disabled={submittingReport}>
                    {submittingReport ? "Mengirim..." : "Kirim Laporan"}
                  </button>
                </div>
              </form>
            </section>

            <section className="section-card">
              <div className="card-header-inline">
                <div>
                  <h3>Riwayat Laporan Saya (`GET /marketplace/me/reports`)</h3>
                  <p className="muted-text">Daftar laporan yang pernah Anda kirim beserta status peninjauan admin.</p>
                </div>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => void loadMyReports()}
                  disabled={reportsLoading}
                >
                  {reportsLoading ? "Memuat..." : "Refresh"}
                </button>
              </div>

              {!accessToken ? (
                <div className="empty-state">
                  <p>Login untuk melihat riwayat laporan yang Anda buat.</p>
                </div>
              ) : myReports.length === 0 ? (
                <div className="empty-state">
                  <p>{reportsLoading ? "Memuat laporan..." : "Belum ada laporan yang dibuat."}</p>
                </div>
              ) : (
                <div className="stack-list">
                  {myReports.map((rep) => (
                    <article key={rep.id} className="item-row-card">
                      <div className="item-row-header">
                        <div>
                          <div className="listing-tags">
                            <span className={`status-badge status-${rep.status}`}>
                              {rep.status.toUpperCase()}
                            </span>
                            <span className="condition-tag">{rep.reason.toUpperCase()}</span>
                            {rep.listing_hidden && (
                              <span className="status-badge status-rejected">Listing Disembunyikan</span>
                            )}
                          </div>
                          <h3>
                            Target:{" "}
                            {rep.target
                              ? `${rep.target.type.toUpperCase()} — ${rep.target.title || rep.target.display_name || rep.target.id}`
                              : "Target tidak tersedia"}
                          </h3>
                          <p className="muted-text">
                            Report ID: <code>{rep.id}</code> · Target ID: <code>{rep.target?.id ?? "-"}</code> ·{" "}
                            {formatDate(rep.created_at)}
                          </p>
                          {rep.details && <p className="muted-text">Detail: {rep.details}</p>}
                          {rep.review_note && (
                            <p className="muted-text">
                              Catatan Admin ({rep.reviewed_by?.display_name ?? "Admin"}): &ldquo;{rep.review_note}&rdquo;
                            </p>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {/* ==================== TAB 5: PANEL ADMIN (MODERASI & KOREKSI) ==================== */}
        {activeTab === "admin" && (
          <div className="stack-layout">
            <div className="notice warning">
              <strong>Area Khusus Admin.</strong> Semua endpoint di bawah hanya dapat diakses oleh akun dengan{" "}
              <code>role: &quot;admin&quot;</code>. Jika diakses oleh non-admin, backend akan mengembalikan{" "}
              <code>403 Forbidden</code> (sesuai Checklist QA #9).
            </div>

            {/* 1. Antrean Laporan Admin */}
            <section className="section-card">
              <div className="card-header-inline">
                <div>
                  <h2>Antrean Laporan (`GET /marketplace/admin/reports`)</h2>
                  <p className="muted-text">
                    Tinjau laporan dengan keputusan <code>RESOLVED</code> atau <code>DISMISSED</code> beserta{" "}
                    <code>review_note</code> wajib.
                  </p>
                </div>
                <div className="inline-form">
                  <select
                    value={adminReportStatusFilter}
                    onChange={(e) =>
                      setAdminReportStatusFilter(e.target.value as AdminReportFilterStatus | "ALL")
                    }
                  >
                    <option value="OPEN">Status: OPEN</option>
                    <option value="RESOLVED">Status: RESOLVED</option>
                    <option value="DISMISSED">Status: DISMISSED</option>
                    <option value="ALL">Semua Status</option>
                  </select>
                  <button
                    type="button"
                    className="button-primary"
                    onClick={() => void loadAdminReports()}
                    disabled={adminReportsLoading}
                  >
                    {adminReportsLoading ? "Memuat..." : "Muat Antrean"}
                  </button>
                </div>
              </div>

              {adminReports.length === 0 ? (
                <div className="empty-state">
                  <p>Klik &ldquo;Muat Antrean&rdquo; untuk mengambil daftar laporan dari server.</p>
                </div>
              ) : (
                <div className="stack-list">
                  {adminReports.map((rep) => (
                    <article key={rep.id} className="item-row-card">
                      <div className="item-row-header">
                        <div>
                          <div className="listing-tags">
                            <span className={`status-badge status-${rep.status}`}>{rep.status}</span>
                            <span className="condition-tag">{rep.reason}</span>
                            {rep.listing_hidden && (
                              <span className="status-badge status-rejected">Listing Hidden</span>
                            )}
                          </div>
                          <h3>
                            {rep.target
                              ? `[${rep.target.type.toUpperCase()}] ${rep.target.title || rep.target.display_name || rep.target.id}`
                              : "Target dihapus"}
                          </h3>
                          <p className="muted-text">
                            Report ID: <code>{rep.id}</code> · Pelapor: {rep.reporter.display_name} (
                            <code>{rep.reporter.id}</code>) · {formatDate(rep.created_at)}
                          </p>
                          {rep.details && <p className="muted-text">Detail Laporan: {rep.details}</p>}
                          {rep.review_note && (
                            <p className="muted-text">
                              Ditinjau oleh {rep.reviewed_by?.display_name}: &ldquo;{rep.review_note}&rdquo; (
                              {formatDate(rep.reviewed_at)})
                            </p>
                          )}
                        </div>
                        {rep.target?.type === "listing" && (
                          <button
                            type="button"
                            className="button-secondary"
                            onClick={() => {
                              setModListingId(rep.target?.id ?? "");
                              void handleLoadModerationHistory(rep.target?.id ?? "");
                            }}
                          >
                            Moderasi Listing Ini
                          </button>
                        )}
                      </div>

                      {rep.status === "open" && (
                        <div className="sub-action-box">
                          <strong>Review Laporan (`POST /marketplace/admin/reports/{rep.id}/review`)</strong>
                          <div className="inline-form">
                            <select
                              value={adminReviewDecision[rep.id] ?? "RESOLVED"}
                              onChange={(e) =>
                                setAdminReviewDecision((curr) => ({
                                  ...curr,
                                  [rep.id]: e.target.value as AdminReportDecision,
                                }))
                              }
                            >
                              <option value="RESOLVED">RESOLVED</option>
                              <option value="DISMISSED">DISMISSED</option>
                            </select>
                            <input
                              type="text"
                              maxLength={500}
                              placeholder="Catatan review (wajib diisi)..."
                              value={adminReviewNotes[rep.id] ?? ""}
                              onChange={(e) =>
                                setAdminReviewNotes((curr) => ({ ...curr, [rep.id]: e.target.value }))
                              }
                            />
                            <button
                              type="button"
                              className="button-primary"
                              onClick={() => void handleAdminReviewReport(rep.id)}
                            >
                              Kirim Keputusan
                            </button>
                          </div>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>

            {/* 2. Moderasi Hide / Restore Listing */}
            <section className="section-card">
              <h2>Moderasi Listing (`GET, POST /marketplace/admin/listings/&#123;listingId&#125;/moderation`)</h2>
              <p className="muted-text">
                Sembunyikan (<code>HIDE</code>) atau pulihkan (<code>RESTORE</code>) listing. Listing tersembunyi tidak
                muncul di publik, tetapi tetap memakai kuota dan masa tayang.
              </p>

              <form className="form-grid" onSubmit={handleModerateListing}>
                <label className="field">
                  <span>Listing UUID (`listingId`)</span>
                  <input
                    type="text"
                    required
                    placeholder="Masukkan UUID listing..."
                    value={modListingId}
                    onChange={(e) => setModListingId(e.target.value)}
                  />
                </label>

                <label className="field">
                  <span>Tindakan (`action`)</span>
                  <select
                    value={modAction}
                    onChange={(e) => setModAction(e.target.value as ModerationActionType)}
                  >
                    <option value="HIDE">HIDE — Sembunyikan dari publik</option>
                    <option value="RESTORE">RESTORE — Pulihkan ke publik</option>
                  </select>
                </label>

                <label className="field span-2">
                  <span>Alasan Moderasi (`reason` — wajib diisi, maks. 500 karakter)</span>
                  <input
                    type="text"
                    required
                    maxLength={500}
                    placeholder="Contoh: Menunggu pemeriksaan laporan"
                    value={modReason}
                    onChange={(e) => setModReason(e.target.value)}
                  />
                </label>

                <div className="filter-actions span-2">
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => void handleLoadModerationHistory()}
                    disabled={modLoading || !modListingId.trim()}
                  >
                    Lihat Riwayat Moderasi (`GET`)
                  </button>
                  <button type="submit" className="button-primary" disabled={modLoading}>
                    {modLoading ? "Memproses..." : `Jalankan ${modAction}`}
                  </button>
                </div>
              </form>

              {modResult && (
                <div className="notice info">
                  Status moderasi terbaru untuk listing <code>{modResult.id}</code>:{" "}
                  <strong>hidden = {String(modResult.hidden)}</strong>{" "}
                  {modResult.moderation_reason ? `(Alasan: ${modResult.moderation_reason})` : ""}
                </div>
              )}

              {modHistory.length > 0 && (
                <div className="stack-list">
                  <h4>Riwayat Tindakan Moderasi</h4>
                  {modHistory.map((act) => (
                    <div key={act.id} className="item-row-card compact-row">
                      <span className={`status-badge status-${act.action === "hide" ? "rejected" : "confirmed"}`}>
                        {act.action.toUpperCase()}
                      </span>
                      <span>
                        Alasan: <strong>{act.reason}</strong>
                      </span>
                      <span className="muted-text">
                        Oleh {act.admin.display_name} pada {formatDate(act.created_at)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* 3. Koreksi Pembeli & Audit */}
            <section className="section-card">
              <h2>
                Koreksi Pembeli Transaksi Terkonfirmasi (`POST /marketplace/admin/sales/&#123;saleId&#125;/correct-buyer`)
              </h2>
              <p className="muted-text">
                Menghapus rating lama, mencatat alasan/audit, dan mengembalikan status transaksi ke{" "}
                <code>awaiting_confirmation</code> untuk pembeli baru.
              </p>

              <form className="form-grid" onSubmit={handleCorrectBuyer}>
                <label className="field">
                  <span>Sale UUID (`saleId`)</span>
                  <input
                    type="text"
                    required
                    placeholder="UUID transaksi penjualan..."
                    value={correctSaleId}
                    onChange={(e) => setCorrectSaleId(e.target.value)}
                  />
                </label>

                <label className="field">
                  <span>Buyer UUID Baru (`buyer_id`)</span>
                  <input
                    type="text"
                    required
                    placeholder="UUID pembeli baru (HP terverifikasi)..."
                    value={correctBuyerId}
                    onChange={(e) => setCorrectBuyerId(e.target.value)}
                  />
                </label>

                <label className="field span-2">
                  <span>Alasan Koreksi (`reason` — wajib diisi)</span>
                  <input
                    type="text"
                    required
                    maxLength={500}
                    placeholder="Contoh: Penjual salah menautkan akun pembeli saat transaksi..."
                    value={correctReason}
                    onChange={(e) => setCorrectReason(e.target.value)}
                  />
                </label>

                <div className="filter-actions span-2">
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => void handleLoadSaleCorrections()}
                    disabled={correctionsLoading || !correctSaleId.trim()}
                  >
                    Lihat Audit Koreksi (`GET /corrections`)
                  </button>
                  <button type="submit" className="button-primary" disabled={correctionsLoading}>
                    {correctionsLoading ? "Memproses..." : "Koreksi Pembeli"}
                  </button>
                </div>
              </form>

              {saleCorrections.length > 0 && (
                <div className="stack-list">
                  <h4>Riwayat Audit Koreksi Pembeli</h4>
                  {saleCorrections.map((corr) => (
                    <div key={corr.id} className="item-row-card compact-row">
                      <span className="condition-tag">{corr.action}</span>
                      <span>
                        Dari <strong>{corr.previous_buyer.display_name}</strong> (<code>{corr.previous_buyer.id}</code>)
                        {" → "}
                        Ke <strong>{corr.new_buyer.display_name}</strong> (<code>{corr.new_buyer.id}</code>)
                      </span>
                      <span>Alasan: &ldquo;{corr.reason}&rdquo;</span>
                      <span className="muted-text">
                        Admin: {corr.admin.display_name} · {formatDate(corr.created_at)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {/* ==================== TAB 6: AKUN, VERIFIKASI OTP & BEARER TOKEN QA ==================== */}
        {activeTab === "account" && (
          <div className="stack-layout">
            {/* Status Sesi Saat Ini */}
            <section className="section-card">
              <div className="card-header-inline">
                <div>
                  <h2>Status Autentikasi & Akun Saat Ini</h2>
                  <p className="muted-text">
                    Semua endpoint terproteksi mengirim header <code>Authorization: Bearer &lt;access-token&gt;</code>.
                  </p>
                </div>
                {accessToken && (
                  <button type="button" className="button-secondary danger-btn" onClick={handleLogout}>
                    Logout / Hapus Token
                  </button>
                )}
              </div>

              {currentUser ? (
                <div className="profile-summary-box">
                  <div className="profile-summary-main">
                    <div>
                      <strong>{currentUser.display_name}</strong> ({currentUser.email})
                      <div className="listing-tags" style={{ marginTop: 6 }}>
                        <span className="condition-tag">Role: {currentUser.role.toUpperCase()}</span>
                        <span className="condition-tag">Tier: {currentUser.tier.toUpperCase()}</span>
                        <span
                          className={`status-badge ${currentUser.phone_verified ? "status-confirmed" : "status-rejected"}`}
                        >
                          {currentUser.phone_verified ? "✓ HP Terverifikasi" : "✕ HP Belum Terverifikasi"}
                        </span>
                      </div>
                      <p className="muted-text" style={{ marginTop: 6 }}>
                        User UUID: <code>{currentUser.id}</code>
                      </p>
                    </div>
                    <div className="action-row">
                      <button
                        type="button"
                        className="button-secondary"
                        onClick={() => void fetchCurrentUser(accessToken)}
                        disabled={authLoading}
                      >
                        Refresh `/users/me`
                      </button>
                      {refreshToken && (
                        <button
                          type="button"
                          className="button-secondary"
                          onClick={() => void handleRefreshToken()}
                          disabled={authLoading}
                        >
                          Rotasi Refresh Token
                        </button>
                      )}
                    </div>
                  </div>

                  {!currentUser.phone_verified && (
                    <form className="sub-action-box" onSubmit={handleVerifyPhone}>
                      <strong>Verifikasi Nomor HP (`POST /auth/verify-phone`)</strong>
                      <p className="muted-text">
                        Masukkan kode OTP 6 digit. (Catatan QA: OTP development bukan provider OTP produksi).
                      </p>
                      {devOtpHint && (
                        <p className="muted-text">
                          Kode <code>development_otp</code> terakhir: <strong>{devOtpHint}</strong>
                        </p>
                      )}
                      <div className="inline-form">
                        <input
                          type="text"
                          required
                          pattern="^[0-9]{6}$"
                          maxLength={6}
                          placeholder="6 digit OTP..."
                          value={otpCode}
                          onChange={(e) => setOtpCode(e.target.value)}
                        />
                        <button type="submit" className="button-primary" disabled={authLoading}>
                          Verifikasi OTP
                        </button>
                        <button
                          type="button"
                          className="button-secondary"
                          onClick={() => void handleResendOtp()}
                          disabled={authLoading}
                        >
                          Kirim Ulang OTP
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              ) : (
                <p className="muted-text">
                  Belum ada akun yang aktif (Mode Pengunjung Publik). Gunakan form Login, Registrasi, atau tempel
                  Bearer Access Token secara langsung di bawah.
                </p>
              )}

              {/* Input Manual Bearer Token untuk QA */}
              <form className="sub-action-box" onSubmit={handleSaveManualToken}>
                <strong>Input Langsung Bearer Access Token (Untuk Pengujian QA Multi-Akun)</strong>
                <div className="inline-form">
                  <input
                    type="text"
                    placeholder="Tempel JWT access_token di sini..."
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                  />
                  <button type="submit" className="button-secondary">
                    Gunakan Token
                  </button>
                </div>
              </form>
            </section>

            {/* Login & Register */}
            <div className="two-col-grid">
              <section className="section-card">
                <h3>Login (`POST /auth/login`)</h3>
                <form className="form-stack" onSubmit={handleLogin}>
                  <label className="field">
                    <span>Email</span>
                    <input
                      type="email"
                      required
                      placeholder="nama@email.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Password</span>
                    <input
                      type="password"
                      required
                      placeholder="Password akun..."
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                    />
                  </label>
                  <button type="submit" className="button-primary" disabled={authLoading}>
                    {authLoading ? "Memproses..." : "Login"}
                  </button>
                </form>
              </section>

              <section className="section-card">
                <h3>Daftar Akun Baru (`POST /auth/register`)</h3>
                <form className="form-stack" onSubmit={handleRegister}>
                  <label className="field">
                    <span>Nama Tampilan (`display_name`)</span>
                    <input
                      type="text"
                      required
                      maxLength={80}
                      placeholder="Nama pengguna / toko"
                      value={regDisplayName}
                      onChange={(e) => setRegDisplayName(e.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Email</span>
                    <input
                      type="email"
                      required
                      placeholder="nama@email.com"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Nomor HP (`phone_number`, 8–24 karakter)</span>
                    <input
                      type="tel"
                      required
                      minLength={8}
                      maxLength={24}
                      placeholder="081234567890"
                      value={regPhone}
                      onChange={(e) => setRegPhone(e.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Password (minimal 12 karakter)</span>
                    <input
                      type="password"
                      required
                      minLength={12}
                      maxLength={128}
                      placeholder="Minimal 12 karakter..."
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                    />
                  </label>
                  <button type="submit" className="button-secondary" disabled={authLoading}>
                    {authLoading ? "Mendaftarkan..." : "Daftar & Minta OTP"}
                  </button>
                </form>
              </section>
            </div>

            {/* Ringkasan Checklist QA & Batasan sesuai docs.md Seksi 6 & 7 */}
            <section className="section-card">
              <h3>6. Checklist QA Integrasi & 7. Batasan Rilis (Sesuai `docs.md`)</h3>
              <ol className="qa-checklist">
                <li>Pengunjung tanpa login dapat mencari listing aktif dan membuka profil publik (Tab Jelajah).</li>
                <li>Akun tanpa HP terverifikasi ditolak (<code>403 Forbidden</code>) saat melakukan tindakan yang mewajibkan verifikasi.</li>
                <li>Penjual menandai listing terjual tanpa pembeli; response memiliki <code>transaction: null</code> (Tab Listing Saya).</li>
                <li>Penjual menandai terjual dengan pembeli verified; pembeli yang salah ditolak, pembeli benar dapat konfirmasi (Tab Transaksi).</li>
                <li>Rating sebelum konfirmasi atau dari akun lain ditolak; rating 1–5 setelah konfirmasi diterima dan hanya satu per transaksi.</li>
                <li>Pembeli menolak transaksi (<code>REJECT</code>); listing tetap <code>Sold</code> dan penjual dapat menghubungkan pembeli baru.</li>
                <li>Admin mengoreksi pembeli; rating lama hilang, alasan tersimpan, dan pembeli baru perlu konfirmasi ulang (Tab Admin).</li>
                <li>Pengguna membuat laporan listing/pengguna, melihat laporan sendiri, dan tidak dapat mengirim laporan Open duplikat pada target yang sama (Tab Laporan).</li>
                <li>Non-admin tidak dapat membuka antrean atau endpoint moderasi admin (Tab Admin).</li>
                <li>Admin hide/restore listing; listing hidden tidak dapat dibuka publik, tetap ada di kuota, dan riwayat tindakan menampilkan alasan.</li>
              </ol>
              <p className="muted-text small-note">
                Batasan: Konfirmasi pembeli dan rating bukan bukti pembayaran independen (checkout/escrow/payment
                gateway tidak tersedia). Upload foto memerlukan kredensial Cloudinary yang valid (tanpa konfigurasi
                mengembalikan <code>503</code>). Kode wilayah ditujukan untuk Kota Semarang.
              </p>
            </section>
          </div>
        )}
      </main>

      {/* Navigasi Mobile Bawah */}
      <nav className="mobile-nav" aria-label="Navigasi bawah">
        <button
          type="button"
          className={`mobile-nav-item ${activeTab === "explore" ? "active" : ""}`}
          onClick={() => setActiveTab("explore")}
        >
          <Icon name="market" />
          <span>Jelajah</span>
        </button>
        <button
          type="button"
          className={`mobile-nav-item ${activeTab === "my-listings" ? "active" : ""}`}
          onClick={() => setActiveTab("my-listings")}
        >
          <Icon name="box" />
          <span>Listingku</span>
        </button>
        <button
          type="button"
          className={`mobile-nav-item ${activeTab === "transactions" ? "active" : ""}`}
          onClick={() => setActiveTab("transactions")}
        >
          <Icon name="swap" />
          <span>Transaksi</span>
        </button>
        <button
          type="button"
          className={`mobile-nav-item ${activeTab === "reports" ? "active" : ""}`}
          onClick={() => setActiveTab("reports")}
        >
          <Icon name="flag" />
          <span>Laporan</span>
        </button>
        <button
          type="button"
          className={`mobile-nav-item ${activeTab === "admin" ? "active" : ""}`}
          onClick={() => setActiveTab("admin")}
        >
          <Icon name="shield" />
          <span>Admin</span>
        </button>
        <button
          type="button"
          className={`mobile-nav-item ${activeTab === "account" ? "active" : ""}`}
          onClick={() => setActiveTab("account")}
        >
          <Icon name="user" />
          <span>Akun</span>
        </button>
      </nav>

      {/* Modal Detail Listing Publik */}
      {selectedListing && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeListing();
          }}
        >
          <section className="detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-title">
            <button className="modal-close" type="button" aria-label="Tutup detail" onClick={closeListing}>
              ×
            </button>
            {detailLoading ? (
              <p className="detail-message">Memuat detail listing...</p>
            ) : detailError ? (
              <div className="detail-content">
                <p className="error-text" role="alert">
                  {detailError}
                </p>
                <p className="muted-text">
                  Listing mungkin sudah tidak tersedia secara publik atau disembunyikan oleh moderator (404 Not Found).
                </p>
              </div>
            ) : (
              <>
                <ListingImage listing={selectedListing} className="detail-image" />
                <div className="detail-content">
                  <div className="listing-tags">
                    <span className="condition-tag">{CONDITION_LABELS[selectedListing.condition]}</span>
                    <span className={`status-badge status-${selectedListing.status}`}>
                      {LISTING_STATUS_LABELS[selectedListing.status]}
                    </span>
                  </div>
                  <h2 id="detail-title">{selectedListing.title}</h2>
                  <p className="detail-price">{formatPrice(selectedListing.price)}</p>
                  <p className="detail-description">{selectedListing.description}</p>
                  <div className="detail-meta">
                    <span>
                      <Icon name="pin" /> {selectedListing.location.kelurahan}, {selectedListing.location.district} (
                      {selectedListing.location.code})
                    </span>
                    <span>
                      Penjual: <strong>{selectedListing.seller.display_name || "Penjual Aquaku"}</strong>
                      {selectedListing.seller.verified_store ? " · ✓ Terverifikasi" : ""}
                    </span>
                    <span>Listing ID: {selectedListing.id}</span>
                    <span>Dipasang {formatDate(selectedListing.created_at)}</span>
                  </div>

                  <div className="modal-actions">
                    {selectedListing.seller.whatsapp_url && (
                      <a
                        className="button-primary contact-button"
                        href={selectedListing.seller.whatsapp_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Hubungi Penjual via WhatsApp
                      </a>
                    )}
                    <div className="action-row">
                      <button
                        type="button"
                        className="button-secondary"
                        onClick={() => {
                          const sellerId = selectedListing.seller.id;
                          closeListing();
                          void openPublicProfile(sellerId);
                        }}
                      >
                        Lihat Profil & Rating Penjual
                      </button>
                      <button
                        type="button"
                        className="button-secondary"
                        onClick={() => prefillReport("LISTING", selectedListing.id)}
                      >
                        Laporkan Listing
                      </button>
                      <button
                        type="button"
                        className="button-secondary"
                        onClick={() => {
                          const targetId = selectedListing.id;
                          closeListing();
                          setModListingId(targetId);
                          setActiveTab("admin");
                          void handleLoadModerationHistory(targetId);
                        }}
                      >
                        Moderasi (Admin)
                      </button>
                    </div>
                  </div>
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
        <div className="listing-tags">
          <span className="condition-tag">{CONDITION_LABELS[listing.condition]}</span>
          {listing.seller.verified_store && <span className="verified-tag">✓ Toko terverifikasi</span>}
        </div>
        <h3>{listing.title}</h3>
        <p className="listing-category">
          {listing.category.name} · {listing.location.kelurahan}
        </p>
        <div className="listing-bottom">
          <strong>{formatPrice(listing.price)}</strong>
          <span>{listing.seller.display_name || "Penjual Aquaku"}</span>
        </div>
      </div>
    </button>
  );
}

function ListingImage({ listing, className }: { listing: Listing; className: string }) {
  const image = listing.photos.find((photo) => photo.url)?.url;
  return (
    <div className={className}>
      {image ? <img src={image} alt={listing.title} loading="lazy" /> : <span aria-hidden="true">🪴</span>}
      <span className="location-stamp">
        <Icon name="pin" /> {listing.location.district}
      </span>
    </div>
  );
}

function Icon({
  name,
}: {
  name: "forum" | "market" | "pin" | "search" | "box" | "swap" | "flag" | "shield" | "user";
}) {
  const paths = {
    forum: (
      <>
        <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H6l-3 2v-6a7.5 7.5 0 1 1 17-3.5Z" />
        <path d="M8 11h8M8 14.5h5" />
      </>
    ),
    market: (
      <>
        <path d="M3 9h18l-1.5 11h-15L3 9Z" />
        <path d="m3 9 2-5h14l2 5M9 9l1 11m5-11-1 11" />
      </>
    ),
    pin: (
      <>
        <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
    search: (
      <>
        <circle cx="10.8" cy="10.8" r="6.8" />
        <path d="m16 16 4 4" />
      </>
    ),
    box: (
      <>
        <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
        <path d="m3.3 7 8.7 5 8.7-5M12 22V12" />
      </>
    ),
    swap: (
      <>
        <path d="m16 3 4 4-4 4" />
        <path d="M20 7H4" />
        <path d="m8 21-4-4 4-4" />
        <path d="M4 17h16" />
      </>
    ),
    flag: (
      <>
        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
        <line x1="4" x2="4" y1="22" y2="15" />
      </>
    ),
    shield: (
      <>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </>
    ),
    user: (
      <>
        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </>
    ),
  };
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
