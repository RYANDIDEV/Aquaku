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
  NEW: "Baru",
  LIKE_NEW: "Seperti Baru",
  SECOND: "Bekas",
};

const LISTING_STATUS_LABELS: Record<Listing["status"], string> = {
  active: "Aktif",
  sold: "Terjual",
  expired: "Kedaluwarsa",
  inactive: "Nonaktif",
};

const TRANSACTION_STATUS_LABELS: Record<SaleTransaction["status"], string> = {
  awaiting_confirmation: "Menunggu Konfirmasi",
  confirmed: "Terkonfirmasi",
  rejected: "Ditolak",
  cancelled: "Dibatalkan",
};

const REPORT_STATUS_LABELS: Record<Report["status"], string> = {
  open: "Menunggu Tinjauan",
  resolved: "Ditindaklanjuti",
  dismissed: "Ditolak",
};

const REPORT_REASONS: Array<{ value: ReportReason; label: string }> = [
  { value: "SPAM", label: "Spam atau iklan berulang" },
  { value: "SCAM", label: "Indikasi penipuan" },
  { value: "PROHIBITED_ITEM", label: "Barang terlarang atau dilindungi" },
  { value: "MISLEADING", label: "Informasi atau foto tidak sesuai" },
  { value: "HARASSMENT", label: "Pelecehan atau penyalahgunaan" },
  { value: "OTHER", label: "Lainnya" },
];

const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  SPAM: "Spam",
  SCAM: "Penipuan",
  PROHIBITED_ITEM: "Barang Terlarang",
  MISLEADING: "Tidak Sesuai",
  HARASSMENT: "Pelecehan",
  OTHER: "Lainnya",
};

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
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  // Auth & Session state
  const [accessToken, setAccessToken] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
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
  const [regions, setRegions] = useState<Region[]>([]);
  const [referenceError, setReferenceError] = useState("");
  const [listError, setListError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);

  // Selected listing modal & public profile
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [detailError, setDetailError] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const detailRequest = useRef<AbortController | null>(null);

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
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [submittingListing, setSubmittingListing] = useState(false);

  // Mark sold & link buyer state
  const [soldBuyerInputs, setSoldBuyerInputs] = useState<Record<string, string>>({});

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
  const fetchCurrentUser = useCallback(async (tokenToUse: string) => {
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
  }, []);

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
        if (taxonomyResult.value.data.categories[0]) {
          setFormCategoryId((prev) => prev || taxonomyResult.value.data.categories[0].id);
        }
      } else {
        errors.push("Pilihan kategori belum tersedia.");
      }

      if (regionsResult.status === "fulfilled") {
        setRegions(regionsResult.value.data);
        if (regionsResult.value.data[0]) {
          setFormRegionCode((prev) => prev || regionsResult.value.data[0].code);
        }
      } else {
        errors.push("Pilihan wilayah belum tersedia.");
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

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.category) count++;
    if (filters.condition) count++;
    if (filters.districtCode) count++;
    if (filters.regionCode) count++;
    if (filters.minPrice) count++;
    if (filters.maxPrice) count++;
    if (filters.sort !== "newest") count++;
    return count;
  }, [filters]);

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setAppliedFilters({ ...filters });
    setShowMobileFilters(false);
  }

  function resetFilters() {
    setFilters(INITIAL_FILTERS);
    setAppliedFilters(INITIAL_FILTERS);
    setPage(1);
    setShowMobileFilters(false);
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
        setDetailError(formatted.message);
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

  async function openPublicProfile(userId: string) {
    if (!userId.trim()) return;
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
      setProfileError(formatted.message);
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
      setRefreshToken(res.data.refresh_token);
      window.localStorage.setItem("aquaku-refresh-token", res.data.refresh_token);
      setCurrentUser(res.data.user);
      setBanner({
        type: "success",
        title: "Berhasil masuk",
        message: `Selamat datang kembali, ${res.data.user.display_name}.`,
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
        title: "Pendaftaran berhasil",
        message: res.development_otp
          ? `Silakan masuk lalu verifikasi nomor HP kamu dengan kode: ${res.development_otp}`
          : "Akun berhasil dibuat. Silakan masuk dan verifikasi nomor HP kamu.",
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
        title: "Nomor HP terverifikasi",
        message: "Akun kamu sudah aktif dan siap digunakan untuk jual beli.",
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
        title: "Kode dikirim ulang",
        message: res.data?.development_otp
          ? `Kode verifikasi terbaru kamu: ${res.data.development_otp}`
          : "Kode verifikasi baru telah dikirim ke nomor HP kamu.",
      });
    } catch (error) {
      handleApiError(error);
    } finally {
      setAuthLoading(false);
    }
  }

  function handleLogout() {
    setAccessToken("");
    setRefreshToken("");
    setCurrentUser(null);
    window.localStorage.removeItem("aquaku-access-token");
    window.localStorage.removeItem("aquaku-refresh-token");
    setBanner({
      type: "info",
      title: "Berhasil keluar",
      message: "Kamu telah keluar dari akun.",
    });
  }

  // Photo Upload
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
        throw new Error("Gagal mengunggah foto. Silakan coba lagi.");
      }

      await apiPost("/api/v1/marketplace/media/confirm-upload", {
        token: accessToken,
        body: { asset_id: sig.asset_id },
      });

      setFormPhotoIds((current) => [...current, sig.asset_id]);
      setBanner({
        type: "success",
        title: "Foto terunggah",
        message: "Foto berhasil ditambahkan ke listing.",
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
        title: "Foto dihapus",
        message: "Foto telah dihapus dari daftar.",
      });
    } catch (error) {
      setFormPhotoIds((current) => current.filter((id) => id !== assetId));
      handleApiError(error);
    }
  }

  // Create or Update Listing
  async function handleSubmitListing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) {
      setBanner({
        type: "error",
        title: "Silakan masuk",
        message: "Masuk terlebih dahulu untuk memasang atau mengubah listing.",
      });
      setActiveTab("account");
      return;
    }

    const parsedPrice = Number.parseInt(formPrice, 10);
    if (!Number.isFinite(parsedPrice) || parsedPrice < 1) {
      setBanner({
        type: "error",
        title: "Harga belum sesuai",
        message: "Masukkan harga minimal Rp 1.",
      });
      return;
    }

    if (formPhotoIds.length < 1) {
      setBanner({
        type: "error",
        title: "Foto belum ada",
        message: "Tambahkan minimal 1 foto produk.",
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
          title: "Perubahan disimpan",
          message: `"${res.data.title}" berhasil diperbarui.`,
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
          title: "Listing diterbitkan",
          message: `"${res.data.title}" kini tampil di marketplace.`,
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
  }

  // Mark Listing as Sold
  async function handleMarkSold(listingId: string) {
    if (!accessToken) return;
    const rawBuyerId = (soldBuyerInputs[listingId] ?? "").trim();
    setBanner(null);
    try {
      const res = await apiPost<ApiEnvelope<MarkSoldData>>(
        `/api/v1/marketplace/listings/${encodeURIComponent(listingId)}/sold`,
        {
          token: accessToken,
          body: rawBuyerId ? { buyer_id: rawBuyerId } : undefined,
        },
      );
      setBanner({
        type: "success",
        title: "Ditandai terjual",
        message: res.data.transaction
          ? "Menunggu konfirmasi dari pembeli."
          : "Listing berhasil ditandai terjual.",
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

  // Link or Replace Buyer before confirmation
  async function handleLinkOrReplaceBuyer(listingId: string, buyerIdInput?: string) {
    if (!accessToken) return;
    const buyerId = (buyerIdInput ?? replaceBuyerInputs[listingId] ?? soldBuyerInputs[listingId] ?? "").trim();
    if (!buyerId) {
      setBanner({
        type: "error",
        title: "ID Pembeli belum diisi",
        message: "Masukkan ID akun pembeli terlebih dahulu.",
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
        title: "Pembeli dihubungkan",
        message: `Menunggu konfirmasi dari ${res.data.buyer.display_name}.`,
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

  // Cancel Awaiting Sale
  async function handleCancelSale(saleId: string) {
    if (!accessToken) return;
    setBanner(null);
    try {
      await apiDelete<ApiEnvelope<SaleTransaction>>(
        `/api/v1/marketplace/sales/${encodeURIComponent(saleId)}`,
        { token: accessToken },
      );
      setBanner({
        type: "info",
        title: "Transaksi dibatalkan",
        message: "Tautan pembeli pada penjualan ini telah dibatalkan.",
      });
      void loadTransactions();
      void loadMyListingsAndQuota();
    } catch (error) {
      handleApiError(error, () => {
        void loadTransactions();
      });
    }
  }

  // Buyer Respond to Transaction
  async function handleRespondSale(saleId: string, decision: BuyerDecision) {
    if (!accessToken) return;
    const note = (respondNotes[saleId] ?? "").trim();
    setBanner(null);
    try {
      await apiPost<ApiEnvelope<SaleTransaction>>(
        `/api/v1/marketplace/sales/${encodeURIComponent(saleId)}/respond`,
        {
          token: accessToken,
          body: note ? { decision, note } : { decision },
        },
      );
      setBanner({
        type: "success",
        title: decision === "CONFIRM" ? "Pembelian dikonfirmasi" : "Pembelian ditolak",
        message:
          decision === "CONFIRM"
            ? "Terima kasih! Kamu sekarang dapat memberikan penilaian untuk penjual."
            : "Transaksi telah ditolak.",
      });
      void loadTransactions();
    } catch (error) {
      handleApiError(error, () => {
        void loadTransactions();
      });
    }
  }

  // Buyer Submit Rating
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
        title: "Ulasan tersimpan",
        message: `Terima kasih telah memberikan penilaian ★ ${res.data.score}/5.`,
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
      setBanner({ type: "success", title: "Listing diperpanjang", message: "Listing kembali aktif." });
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
      setBanner({ type: "success", title: "Listing diaktifkan", message: "Listing kembali tampil di marketplace." });
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
      setBanner({ type: "info", title: "Listing dihapus", message: "Listing telah dihapus dari daftar aktif." });
      void loadMyListingsAndQuota();
      setReload((c) => c + 1);
    } catch (error) {
      handleApiError(error, () => void loadMyListingsAndQuota());
    }
  }

  // Create Report
  async function handleCreateReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) {
      setBanner({
        type: "error",
        title: "Silakan masuk",
        message: "Masuk terlebih dahulu untuk mengirim laporan.",
      });
      setActiveTab("account");
      return;
    }
    setSubmittingReport(true);
    setBanner(null);
    try {
      await apiPost<ApiEnvelope<Report>>("/api/v1/marketplace/reports", {
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
        title: "Laporan terkirim",
        message: "Terima kasih, laporan kamu sedang kami tinjau.",
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

  // Admin: Review Report
  async function handleAdminReviewReport(reportId: string) {
    const decision = adminReviewDecision[reportId] ?? "RESOLVED";
    const reviewNote = (adminReviewNotes[reportId] ?? "").trim();
    if (!reviewNote) {
      setBanner({
        type: "error",
        title: "Catatan wajib diisi",
        message: "Tuliskan catatan hasil tinjauan sebelum menyimpan keputusan.",
      });
      return;
    }
    setBanner(null);
    try {
      await apiPost<ApiEnvelope<Report>>(
        `/api/v1/marketplace/admin/reports/${encodeURIComponent(reportId)}/review`,
        {
          token: accessToken,
          body: { decision, review_note: reviewNote },
        },
      );
      setBanner({
        type: "success",
        title: "Laporan selesai ditinjau",
        message: "Status laporan berhasil diperbarui.",
      });
      void loadAdminReports();
    } catch (error) {
      handleApiError(error, () => {
        void loadAdminReports();
      });
    }
  }

  // Admin: Listing Moderation
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
        title: "Data belum lengkap",
        message: "ID listing dan alasan moderasi wajib diisi.",
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
        title: modAction === "HIDE" ? "Listing disembunyikan" : "Listing dipulihkan",
        message:
          modAction === "HIDE"
            ? "Listing telah disembunyikan dari halaman publik."
            : "Listing kembali ditampilkan ke publik.",
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

  // Admin: Buyer Correction
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
        title: "Data belum lengkap",
        message: "ID transaksi, ID pembeli baru, dan alasan koreksi wajib diisi.",
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
        title: "Pembeli diperbarui",
        message: `Transaksi kini menunggu konfirmasi dari ${res.data.buyer.display_name}.`,
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

  const isAdmin = currentUser?.role === "admin";

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
            Aquaku<small>aquascape semarang</small>
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
            <span>Lapakku</span>
          </button>
          <button
            type="button"
            className={`nav-link ${activeTab === "transactions" ? "active" : ""}`}
            onClick={() => setActiveTab("transactions")}
          >
            <Icon name="swap" />
            <span>Transaksi</span>
          </button>
          <button
            type="button"
            className={`nav-link ${activeTab === "reports" ? "active" : ""}`}
            onClick={() => setActiveTab("reports")}
          >
            <Icon name="flag" />
            <span>Bantuan</span>
          </button>
          {isAdmin && (
            <button
              type="button"
              className={`nav-link ${activeTab === "admin" ? "active" : ""}`}
              onClick={() => setActiveTab("admin")}
            >
              <Icon name="shield" />
              <span>Admin</span>
            </button>
          )}
          <button
            type="button"
            className={`nav-link ${activeTab === "account" ? "active" : ""}`}
            onClick={() => setActiveTab("account")}
          >
            <Icon name="user" />
            <span>{currentUser ? currentUser.display_name : "Akun"}</span>
          </button>
        </nav>

        <div className="top-actions">
          {currentUser ? (
            <button
              type="button"
              className="user-badge-btn"
              onClick={() => setActiveTab("account")}
            >
              <span className={`status-dot ${currentUser.phone_verified ? "verified" : "unverified"}`} />
              <span className="user-badge-name">{currentUser.display_name}</span>
            </button>
          ) : (
            <button type="button" className="button-secondary compact-btn" onClick={() => setActiveTab("account")}>
              Masuk
            </button>
          )}
          <button
            className="theme-toggle"
            type="button"
            aria-label={theme === "dark" ? "Mode terang" : "Mode gelap"}
            aria-pressed={theme === "dark"}
            onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
          >
            <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
            <span className="theme-label">{theme === "dark" ? "Terang" : "Gelap"}</span>
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
              <strong>{banner.title}</strong>
              <p>{banner.message}</p>
            </div>
            <button type="button" className="banner-close" onClick={() => setBanner(null)} aria-label="Tutup pesan">
              ×
            </button>
          </div>
        )}

        {currentUser && !currentUser.phone_verified && (
          <div className="notice warning" role="status">
            <strong>Nomor HP kamu belum terverifikasi.</strong> Verifikasi diperlukan untuk memasang iklan, bertransaksi,
            dan memberi ulasan.{" "}
            <button type="button" className="inline-link" onClick={() => setActiveTab("account")}>
              Verifikasi sekarang
            </button>
          </div>
        )}

        {/* ==================== TAB 1: JELAJAH ==================== */}
        {activeTab === "explore" && (
          <>
            <section className="intro">
              <div>
                <p className="eyebrow">Komunitas Aquascape Semarang</p>
                <h1>Temukan isi tank-mu</h1>
                <p className="subtitle">
                  Tanaman, fauna, dan perlengkapan aquascape pilihan dari penghobi dan toko di sekitar Semarang.
                </p>
              </div>
              <div className="local-note">
                <span className="online-dot" /> Transaksi langsung dengan penjual
              </div>
            </section>

            <form className="filter-panel" onSubmit={applyFilters}>
              <div className="search-bar-row">
                <label className="search-field">
                  <Icon name="search" />
                  <input
                    type="search"
                    maxLength={100}
                    placeholder="Cari tanaman, lampu, filter, atau toko..."
                    value={filters.q}
                    onChange={(event) => updateFilter("q", event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="button-secondary mobile-filter-toggle"
                  onClick={() => setShowMobileFilters((v) => !v)}
                  aria-expanded={showMobileFilters}
                >
                  Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
                </button>
              </div>

              <div className={`filter-collapsible ${showMobileFilters ? "open" : ""}`}>
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
                      <option value="NEW">Baru</option>
                      <option value="LIKE_NEW">Seperti Baru</option>
                      <option value="SECOND">Bekas</option>
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
                      placeholder="Rp min"
                      value={filters.minPrice}
                      onChange={(event) => updateFilter("minPrice", event.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Harga maksimum</span>
                    <input
                      type="number"
                      min="1"
                      placeholder="Rp maks"
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
                    Atur ulang
                  </button>
                  <button type="submit" className="button-primary">
                    <Icon name="search" /> Terapkan
                  </button>
                </div>
              </div>
            </form>

            {/* Profil Penjual (Tampil saat pengguna memilih profil penjual) */}
            {(profileLoading || profileError || publicProfile) && (
              <section className="section-card compact-card">
                {profileLoading ? (
                  <p className="muted-text">Memuat profil penjual...</p>
                ) : profileError ? (
                  <div className="card-header-inline">
                    <p className="error-text">{profileError}</p>
                    <button type="button" className="button-secondary" onClick={() => setProfileError("")}>
                      Tutup
                    </button>
                  </div>
                ) : publicProfile ? (
                  <div className="profile-summary-box">
                    <div className="profile-summary-main">
                      <div>
                        <div className="listing-tags">
                          <strong>{publicProfile.display_name}</strong>
                          <span className="condition-tag">{publicProfile.tier.toUpperCase()}</span>
                          {publicProfile.verified_store && <span className="verified-tag">✓ Toko Terverifikasi</span>}
                        </div>
                        {publicProfile.bio && <p className="profile-bio">{publicProfile.bio}</p>}
                      </div>
                      <div className="profile-stats">
                        <div className="stat-item">
                          <small>Penilaian</small>
                          <strong>
                            {publicProfile.rating_average !== null ? `★ ${publicProfile.rating_average.toFixed(1)}` : "Belum ada"}
                          </strong>
                        </div>
                        <div className="stat-item">
                          <small>Ulasan</small>
                          <strong>{publicProfile.rating_count}</strong>
                        </div>
                        <div className="stat-item">
                          <small>Iklan Aktif</small>
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
                        Laporkan Penjual
                      </button>
                      <button type="button" className="button-secondary" onClick={() => setPublicProfile(null)}>
                        Tutup
                      </button>
                    </div>
                  </div>
                ) : null}
              </section>
            )}

            {referenceError && (
              <p className="notice warning" role="status">
                {referenceError}
              </p>
            )}

            <div className="results-heading">
              <div>
                <h2>Pilihan di Semarang</h2>
                <p>{loading ? "Mencari produk..." : `${pagination.total} produk tersedia`}</p>
              </div>
              {pagination.pages > 1 && (
                <span className="result-page">
                  Hal. {pagination.page} / {pagination.pages}
                </span>
              )}
            </div>

            {listError ? (
              <div className="error-state" role="alert">
                <span className="error-icon">!</span>
                <h3>Produk belum dapat ditampilkan</h3>
                <p>{listError}</p>
                <button
                  className="button-secondary"
                  type="button"
                  onClick={() => setReload((current) => current + 1)}
                >
                  Muat ulang
                </button>
              </div>
            ) : loading ? (
              <div className="listing-grid" aria-label="Memuat produk">
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
                <h3>Belum ada produk yang cocok</h3>
                <p>Coba gunakan kata kunci lain atau atur ulang filter pencarian.</p>
                <button className="button-secondary" type="button" onClick={resetFilters}>
                  Lihat semua produk
                </button>
              </div>
            )}

            {!listError && pagination.pages > 1 && (
              <nav className="pagination" aria-label="Halaman produk">
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

        {/* ==================== TAB 2: LAPAKKU (LISTING SAYA) ==================== */}
        {activeTab === "my-listings" && (
          <div className="stack-layout">
            <section className="section-card">
              <div className="card-header-inline">
                <div>
                  <h2>{editingListingId ? "Ubah Iklan" : "Pasang Iklan Baru"}</h2>
                  <p className="muted-text">
                    Lengkapi foto dan detail produk aquascape yang ingin kamu tawarkan.
                  </p>
                </div>
                {quota && (
                  <div className="quota-pills">
                    <span className="condition-tag">{quota.tier.toUpperCase()}</span>
                    <span className="verified-tag">
                      Sisa kuota: {quota.available_slots} dari {quota.total_quota}
                    </span>
                  </div>
                )}
              </div>

              <form className="form-grid" onSubmit={handleSubmitListing}>
                <label className="field span-2">
                  <span>Nama Produk</span>
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
                  <span>Lokasi Kelurahan</span>
                  <select
                    required
                    value={formRegionCode}
                    onChange={(e) => setFormRegionCode(e.target.value)}
                  >
                    <option value="">Pilih lokasi</option>
                    {regions.map((reg) => (
                      <option key={reg.code} value={reg.code}>
                        {reg.district} — {reg.kelurahan}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Harga (Rp)</span>
                  <input
                    type="number"
                    required
                    min={1}
                    placeholder="Contoh: 50000"
                    value={formPrice}
                    onChange={(e) => setFormPrice(e.target.value)}
                  />
                </label>

                <label className="field">
                  <span>Kondisi Barang</span>
                  <select
                    value={formCondition}
                    onChange={(e) => setFormCondition(e.target.value as Condition)}
                  >
                    <option value="SECOND">Bekas</option>
                    <option value="LIKE_NEW">Seperti Baru</option>
                    <option value="NEW">Baru</option>
                    <option value="BNIB">BNIB</option>
                  </select>
                </label>

                <label className="field span-2">
                  <span>Deskripsi Produk</span>
                  <textarea
                    required
                    minLength={10}
                    maxLength={5000}
                    rows={4}
                    placeholder="Ceritakan kondisi barang, ukuran, kelengkapan, dan lokasi COD..."
                    value={formDesc}
                    onChange={(e) => setFormDesc(e.target.value)}
                  />
                </label>

                <div className="field span-2">
                  <span>Foto Produk (Maks. 8 foto)</span>
                  <div className="photo-upload-box">
                    <div className="inline-form">
                      <label className="button-secondary file-label">
                        {uploadingPhoto ? "Mengunggah foto..." : "+ Tambah Foto"}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          disabled={uploadingPhoto}
                          onChange={handleFileUpload}
                          hidden
                        />
                      </label>
                    </div>
                    {formPhotoIds.length > 0 ? (
                      <div className="chip-list">
                        {formPhotoIds.map((id, idx) => (
                          <span key={id} className="asset-chip">
                            <span>Foto {idx + 1}</span>
                            <button
                              type="button"
                              onClick={() => void handleRemovePhotoAsset(id)}
                              title="Hapus foto"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <small className="muted-text">
                        Tambahkan minimal 1 foto produk yang jelas.
                      </small>
                    )}
                  </div>
                </div>

                <div className="filter-actions span-2">
                  {editingListingId && (
                    <button type="button" className="button-secondary" onClick={resetListingForm}>
                      Batal
                    </button>
                  )}
                  <button type="submit" className="button-primary" disabled={submittingListing}>
                    {submittingListing
                      ? "Menyimpan..."
                      : editingListingId
                        ? "Simpan Perubahan"
                        : "Tayangkan Iklan"}
                  </button>
                </div>
              </form>
            </section>

            <section className="section-card">
              <div className="card-header-inline">
                <div>
                  <h2>Daftar Iklan Saya</h2>
                  <p className="muted-text">Kelola iklan yang sedang tayang maupun yang sudah terjual.</p>
                </div>
                {accessToken && (
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => void loadMyListingsAndQuota()}
                    disabled={myListingsLoading}
                  >
                    {myListingsLoading ? "Memuat..." : "Muat Ulang"}
                  </button>
                )}
              </div>

              {!accessToken ? (
                <div className="empty-state">
                  <p>Masuk ke akunmu untuk mulai memasang dan mengelola iklan.</p>
                  <button type="button" className="button-primary" onClick={() => setActiveTab("account")}>
                    Masuk ke Akun
                  </button>
                </div>
              ) : myListings.length === 0 ? (
                <div className="empty-state">
                  <p>{myListingsLoading ? "Memuat iklan..." : "Kamu belum memasang iklan."}</p>
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
                                Disembunyikan ({item.moderation_reason || "Sedang ditinjau"})
                              </span>
                            )}
                          </div>
                          <h3>{item.title}</h3>
                          <p className="muted-text">
                            <strong>{formatPrice(item.price)}</strong> · {item.category.name} ·{" "}
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
                              Ubah
                            </button>
                          )}
                          {item.status === "expired" && (
                            <button
                              type="button"
                              className="button-secondary"
                              onClick={() => void handleRenewListing(item.id)}
                            >
                              Perpanjang
                            </button>
                          )}
                          {item.status === "inactive" && (
                            <button
                              type="button"
                              className="button-secondary"
                              onClick={() => void handleReactivateListing(item.id)}
                            >
                              Aktifkan
                            </button>
                          )}
                          {item.status !== "sold" && (
                            <button
                              type="button"
                              className="button-secondary danger-btn"
                              onClick={() => void handleDeleteListing(item.id)}
                            >
                              Hapus
                            </button>
                          )}
                        </div>
                      </div>

                      {item.status === "active" && (
                        <div className="sub-action-box">
                          <strong>Sudah laku terjual?</strong>
                          <p className="muted-text">
                            Masukkan ID Akun pembeli jika ingin meminta konfirmasi dan ulasan, atau kosongkan bila terjual langsung.
                          </p>
                          <div className="inline-form">
                            <input
                              type="text"
                              placeholder="ID Akun pembeli (opsional)"
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
                          <strong>Hubungkan atau ganti pembeli</strong>
                          <div className="inline-form">
                            <input
                              type="text"
                              placeholder="Masukkan ID Akun pembeli"
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
                              Simpan Pembeli
                            </button>
                          </div>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}

              {myListingsPagination.pages > 1 && (
                <nav className="pagination" aria-label="Halaman iklan saya">
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

        {/* ==================== TAB 3: TRANSAKSI & ULASAN ==================== */}
        {activeTab === "transactions" && (
          <div className="stack-layout">
            <div className="card-header-inline">
              <div>
                <h2>Transaksi & Ulasan</h2>
                <p className="muted-text">
                  Konfirmasi barang yang kamu beli dan berikan penilaian untuk penjual.
                </p>
              </div>
              {accessToken && (
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => void loadTransactions()}
                  disabled={txLoading}
                >
                  {txLoading ? "Memuat..." : "Muat Ulang"}
                </button>
              )}
            </div>

            {!accessToken ? (
              <div className="empty-state">
                <p>Masuk ke akunmu untuk melihat riwayat pembelian dan penjualan.</p>
                <button type="button" className="button-primary" onClick={() => setActiveTab("account")}>
                  Masuk ke Akun
                </button>
              </div>
            ) : (
              <>
                {/* PEMBELIAN SAYA */}
                <section className="section-card">
                  <h3>Pembelian Saya</h3>
                  {purchases.length === 0 ? (
                    <div className="empty-state">
                      <p>{txLoading ? "Memuat pembelian..." : "Belum ada transaksi pembelian."}</p>
                    </div>
                  ) : (
                    <div className="stack-list">
                      {purchases.map((tx) => (
                        <article key={tx.id} className="item-row-card">
                          <div className="item-row-header">
                            <div>
                              <span className={`status-badge status-${tx.status}`}>
                                {TRANSACTION_STATUS_LABELS[tx.status]}
                              </span>
                              <h3>{tx.listing.title}</h3>
                              <p className="muted-text">
                                <strong>{formatPrice(tx.listing.price)}</strong> · Penjual:{" "}
                                <button
                                  type="button"
                                  className="inline-link"
                                  onClick={() => {
                                    setActiveTab("explore");
                                    void openPublicProfile(tx.seller.id);
                                  }}
                                >
                                  {tx.seller.display_name}
                                </button>{" "}
                                · {formatDate(tx.created_at)}
                              </p>
                              {tx.response_note && (
                                <p className="muted-text">Catatanmu: &ldquo;{tx.response_note}&rdquo;</p>
                              )}
                            </div>
                          </div>

                          {tx.status === "awaiting_confirmation" && (
                            <div className="sub-action-box">
                              <strong>Konfirmasi penerimaan barang</strong>
                              <div className="inline-form">
                                <input
                                  type="text"
                                  maxLength={500}
                                  placeholder="Catatan singkat (opsional)"
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
                                  Terima Barang
                                </button>
                                <button
                                  type="button"
                                  className="button-secondary danger-btn"
                                  onClick={() => void handleRespondSale(tx.id, "REJECT")}
                                >
                                  Tolak
                                </button>
                              </div>
                            </div>
                          )}

                          {tx.status === "confirmed" && (
                            <div className="sub-action-box">
                              {tx.rating ? (
                                <p className="muted-text">
                                  Penilaianmu untuk transaksi ini: <strong>★ {tx.rating.score} / 5</strong>
                                </p>
                              ) : (
                                <>
                                  <strong>Beri penilaian untuk penjual</strong>
                                  <div className="inline-form">
                                    <select
                                      value={ratingScores[tx.id] ?? 5}
                                      onChange={(e) =>
                                        setRatingScores((curr) => ({
                                          ...curr,
                                          [tx.id]: Number.parseInt(e.target.value, 10),
                                        }))
                                      }
                                    >
                                      <option value={5}>★ 5 — Sangat Puas</option>
                                      <option value={4}>★ 4 — Puas</option>
                                      <option value={3}>★ 3 — Cukup</option>
                                      <option value={2}>★ 2 — Kurang</option>
                                      <option value={1}>★ 1 — Kecewa</option>
                                    </select>
                                    <button
                                      type="button"
                                      className="button-primary"
                                      onClick={() => void handleRateSale(tx.id)}
                                    >
                                      Kirim Ulasan
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </article>
                      ))}
                    </div>
                  )}
                </section>

                {/* PENJUALAN SAYA */}
                <section className="section-card">
                  <h3>Penjualan Saya</h3>
                  {sales.length === 0 ? (
                    <div className="empty-state">
                      <p>{txLoading ? "Memuat penjualan..." : "Belum ada transaksi penjualan."}</p>
                    </div>
                  ) : (
                    <div className="stack-list">
                      {sales.map((tx) => (
                        <article key={tx.id} className="item-row-card">
                          <div className="item-row-header">
                            <div>
                              <span className={`status-badge status-${tx.status}`}>
                                {TRANSACTION_STATUS_LABELS[tx.status]}
                              </span>
                              <h3>{tx.listing.title}</h3>
                              <p className="muted-text">
                                <strong>{formatPrice(tx.listing.price)}</strong> · Pembeli:{" "}
                                <strong>{tx.buyer.display_name}</strong> · {formatDate(tx.created_at)}
                              </p>
                              {tx.response_note && (
                                <p className="muted-text">Catatan pembeli: &ldquo;{tx.response_note}&rdquo;</p>
                              )}
                              {tx.rating && (
                                <p className="muted-text">
                                  Ulasan pembeli: <strong>★ {tx.rating.score} / 5</strong>
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
                                  Batalkan
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
                                  ? "Salah memilih pembeli?"
                                  : "Hubungkan dengan pembeli lain"}
                              </strong>
                              <div className="inline-form">
                                <input
                                  type="text"
                                  placeholder="Masukkan ID Akun pembeli baru"
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
                                  Simpan
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

        {/* ==================== TAB 4: BANTUAN & LAPORAN ==================== */}
        {activeTab === "reports" && (
          <div className="stack-layout">
            <section className="section-card">
              <h2>Laporkan Masalah</h2>
              <p className="muted-text">
                Laporkan iklan atau pengguna yang melanggar aturan komunitas kami.
              </p>

              <form className="form-grid" onSubmit={handleCreateReport}>
                <label className="field">
                  <span>Yang Dilaporkan</span>
                  <select
                    value={reportTargetType}
                    onChange={(e) => setReportTargetType(e.target.value as ReportTargetType)}
                  >
                    <option value="LISTING">Iklan Produk</option>
                    <option value="USER">Pengguna / Penjual</option>
                  </select>
                </label>

                <label className="field">
                  <span>ID Iklan atau Pengguna</span>
                  <input
                    type="text"
                    required
                    placeholder="Masukkan ID..."
                    value={reportTargetId}
                    onChange={(e) => setReportTargetId(e.target.value)}
                  />
                </label>

                <label className="field span-2">
                  <span>Alasan</span>
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
                  <span>Keterangan Tambahan</span>
                  <textarea
                    maxLength={1000}
                    rows={3}
                    placeholder="Ceritakan detail kendala yang kamu temukan..."
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
                  <h3>Riwayat Laporan Saya</h3>
                  <p className="muted-text">Pantau status laporan yang pernah kamu kirimkan.</p>
                </div>
                {accessToken && (
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => void loadMyReports()}
                    disabled={reportsLoading}
                  >
                    {reportsLoading ? "Memuat..." : "Muat Ulang"}
                  </button>
                )}
              </div>

              {!accessToken ? (
                <div className="empty-state">
                  <p>Masuk ke akunmu untuk melihat riwayat laporan.</p>
                </div>
              ) : myReports.length === 0 ? (
                <div className="empty-state">
                  <p>{reportsLoading ? "Memuat laporan..." : "Belum ada laporan yang kamu kirim."}</p>
                </div>
              ) : (
                <div className="stack-list">
                  {myReports.map((rep) => (
                    <article key={rep.id} className="item-row-card">
                      <div className="item-row-header">
                        <div>
                          <div className="listing-tags">
                            <span className={`status-badge status-${rep.status}`}>
                              {REPORT_STATUS_LABELS[rep.status]}
                            </span>
                            <span className="condition-tag">
                              {REPORT_REASON_LABELS[rep.reason.toUpperCase() as ReportReason] ?? rep.reason}
                            </span>
                          </div>
                          <h3>
                            {rep.target
                              ? rep.target.title || rep.target.display_name || "Laporan Komunitas"
                              : "Data telah dihapus"}
                          </h3>
                          <p className="muted-text">Dikirim pada {formatDate(rep.created_at)}</p>
                          {rep.details && <p className="muted-text">Keterangan: {rep.details}</p>}
                          {rep.review_note && (
                            <p className="muted-text">
                              Tanggapan moderator: &ldquo;{rep.review_note}&rdquo;
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

        {/* ==================== TAB 5: PANEL ADMIN ==================== */}
        {activeTab === "admin" && (
          <div className="stack-layout">
            {/* 1. Antrean Laporan */}
            <section className="section-card">
              <div className="card-header-inline">
                <div>
                  <h2>Tinjauan Laporan Pengguna</h2>
                  <p className="muted-text">Periksa dan tindak lanjuti laporan yang masuk dari komunitas.</p>
                </div>
                <div className="inline-form">
                  <select
                    value={adminReportStatusFilter}
                    onChange={(e) =>
                      setAdminReportStatusFilter(e.target.value as AdminReportFilterStatus | "ALL")
                    }
                  >
                    <option value="OPEN">Menunggu Tinjauan</option>
                    <option value="RESOLVED">Ditindaklanjuti</option>
                    <option value="DISMISSED">Ditolak</option>
                    <option value="ALL">Semua</option>
                  </select>
                  <button
                    type="button"
                    className="button-primary"
                    onClick={() => void loadAdminReports()}
                    disabled={adminReportsLoading}
                  >
                    {adminReportsLoading ? "Memuat..." : "Tampilkan"}
                  </button>
                </div>
              </div>

              {adminReports.length === 0 ? (
                <div className="empty-state">
                  <p>Belum ada daftar laporan yang ditampilkan.</p>
                </div>
              ) : (
                <div className="stack-list">
                  {adminReports.map((rep) => (
                    <article key={rep.id} className="item-row-card">
                      <div className="item-row-header">
                        <div>
                          <div className="listing-tags">
                            <span className={`status-badge status-${rep.status}`}>
                              {REPORT_STATUS_LABELS[rep.status]}
                            </span>
                            <span className="condition-tag">
                              {REPORT_REASON_LABELS[rep.reason.toUpperCase() as ReportReason] ?? rep.reason}
                            </span>
                            {rep.listing_hidden && (
                              <span className="status-badge status-rejected">Disembunyikan</span>
                            )}
                          </div>
                          <h3>
                            {rep.target
                              ? rep.target.title || rep.target.display_name || rep.target.id
                              : "Data telah dihapus"}
                          </h3>
                          <p className="muted-text">
                            Pelapor: {rep.reporter.display_name} · {formatDate(rep.created_at)}
                          </p>
                          {rep.details && <p className="muted-text">Detail: {rep.details}</p>}
                          {rep.review_note && (
                            <p className="muted-text">
                              Ditinjau oleh {rep.reviewed_by?.display_name}: &ldquo;{rep.review_note}&rdquo;
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
                            Kelola Iklan Ini
                          </button>
                        )}
                      </div>

                      {rep.status === "open" && (
                        <div className="sub-action-box">
                          <strong>Berikan Keputusan</strong>
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
                              <option value="RESOLVED">Tindak Lanjuti</option>
                              <option value="DISMISSED">Tolak Laporan</option>
                            </select>
                            <input
                              type="text"
                              maxLength={500}
                              placeholder="Tulis catatan hasil peninjauan..."
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
                              Simpan
                            </button>
                          </div>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>

            {/* 2. Moderasi Iklan */}
            <section className="section-card">
              <h2>Moderasi Iklan</h2>
              <p className="muted-text">
                Sembunyikan sementara iklan yang melanggar aturan atau tampilkan kembali setelah diperbaiki.
              </p>

              <form className="form-grid" onSubmit={handleModerateListing}>
                <label className="field">
                  <span>ID Iklan</span>
                  <input
                    type="text"
                    required
                    placeholder="Masukkan ID iklan..."
                    value={modListingId}
                    onChange={(e) => setModListingId(e.target.value)}
                  />
                </label>

                <label className="field">
                  <span>Tindakan</span>
                  <select
                    value={modAction}
                    onChange={(e) => setModAction(e.target.value as ModerationActionType)}
                  >
                    <option value="HIDE">Sembunyikan dari publik</option>
                    <option value="RESTORE">Tampilkan kembali ke publik</option>
                  </select>
                </label>

                <label className="field span-2">
                  <span>Alasan</span>
                  <input
                    type="text"
                    required
                    maxLength={500}
                    placeholder="Tuliskan alasan tindakan..."
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
                    Lihat Riwayat
                  </button>
                  <button type="submit" className="button-primary" disabled={modLoading}>
                    {modLoading ? "Memproses..." : "Simpan Tindakan"}
                  </button>
                </div>
              </form>

              {modResult && (
                <div className="notice info">
                  Status iklan saat ini: <strong>{modResult.hidden ? "Disembunyikan" : "Ditampilkan"}</strong>
                  {modResult.moderation_reason ? ` (${modResult.moderation_reason})` : ""}
                </div>
              )}

              {modHistory.length > 0 && (
                <div className="stack-list">
                  <h4>Riwayat Moderasi</h4>
                  {modHistory.map((act) => (
                    <div key={act.id} className="item-row-card compact-row">
                      <span className={`status-badge status-${act.action === "hide" ? "rejected" : "confirmed"}`}>
                        {act.action === "hide" ? "Disembunyikan" : "Dipulihkan"}
                      </span>
                      <span>
                        Alasan: <strong>{act.reason}</strong>
                      </span>
                      <span className="muted-text">
                        Oleh {act.admin.display_name} · {formatDate(act.created_at)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* 3. Koreksi Pembeli */}
            <section className="section-card">
              <h2>Perbaikan Data Pembeli</h2>
              <p className="muted-text">
                Gunakan jika penjual tidak sengaja menghubungkan transaksi ke pembeli yang salah.
              </p>

              <form className="form-grid" onSubmit={handleCorrectBuyer}>
                <label className="field">
                  <span>ID Transaksi</span>
                  <input
                    type="text"
                    required
                    placeholder="Masukkan ID transaksi..."
                    value={correctSaleId}
                    onChange={(e) => setCorrectSaleId(e.target.value)}
                  />
                </label>

                <label className="field">
                  <span>ID Akun Pembeli Baru</span>
                  <input
                    type="text"
                    required
                    placeholder="Masukkan ID pembeli yang benar..."
                    value={correctBuyerId}
                    onChange={(e) => setCorrectBuyerId(e.target.value)}
                  />
                </label>

                <label className="field span-2">
                  <span>Alasan Perbaikan</span>
                  <input
                    type="text"
                    required
                    maxLength={500}
                    placeholder="Contoh: Penjual salah memilih akun pembeli"
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
                    Lihat Riwayat Perbaikan
                  </button>
                  <button type="submit" className="button-primary" disabled={correctionsLoading}>
                    {correctionsLoading ? "Memproses..." : "Perbarui Pembeli"}
                  </button>
                </div>
              </form>

              {saleCorrections.length > 0 && (
                <div className="stack-list">
                  <h4>Riwayat Perbaikan</h4>
                  {saleCorrections.map((corr) => (
                    <div key={corr.id} className="item-row-card compact-row">
                      <span>
                        Dari <strong>{corr.previous_buyer.display_name}</strong> ke{" "}
                        <strong>{corr.new_buyer.display_name}</strong>
                      </span>
                      <span>Alasan: &ldquo;{corr.reason}&rdquo;</span>
                      <span className="muted-text">
                        Oleh {corr.admin.display_name} · {formatDate(corr.created_at)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {/* ==================== TAB 6: AKUN SAYA ==================== */}
        {activeTab === "account" && (
          <div className="stack-layout">
            {currentUser ? (
              <section className="section-card">
                <div className="card-header-inline">
                  <div>
                    <h2>Profil Saya</h2>
                    <p className="muted-text">Informasi akun dan status verifikasi nomor HP kamu.</p>
                  </div>
                  <button type="button" className="button-secondary danger-btn" onClick={handleLogout}>
                    Keluar
                  </button>
                </div>

                <div className="profile-summary-box">
                  <div className="profile-summary-main">
                    <div>
                      <strong>{currentUser.display_name}</strong>
                      <p className="muted-text">{currentUser.email}</p>
                      <div className="listing-tags" style={{ marginTop: 8 }}>
                        <span className="condition-tag">{currentUser.tier.toUpperCase()}</span>
                        <span
                          className={`status-badge ${currentUser.phone_verified ? "status-confirmed" : "status-rejected"}`}
                        >
                          {currentUser.phone_verified ? "✓ Nomor HP Terverifikasi" : "Nomor HP Belum Terverifikasi"}
                        </span>
                      </div>
                      <p className="muted-text" style={{ marginTop: 8 }}>
                        ID Akun: <code>{currentUser.id}</code>
                      </p>
                    </div>
                  </div>

                  {!currentUser.phone_verified && (
                    <form className="sub-action-box" onSubmit={handleVerifyPhone}>
                      <strong>Verifikasi Nomor HP</strong>
                      <p className="muted-text">
                        Masukkan 6 digit kode verifikasi yang dikirimkan ke nomor HP kamu.
                      </p>
                      {devOtpHint && (
                        <p className="muted-text">
                          Kode verifikasi kamu: <strong>{devOtpHint}</strong>
                        </p>
                      )}
                      <div className="inline-form">
                        <input
                          type="text"
                          required
                          pattern="^[0-9]{6}$"
                          maxLength={6}
                          placeholder="Masukkan 6 digit kode"
                          value={otpCode}
                          onChange={(e) => setOtpCode(e.target.value)}
                        />
                        <button type="submit" className="button-primary" disabled={authLoading}>
                          Verifikasi
                        </button>
                        <button
                          type="button"
                          className="button-secondary"
                          onClick={() => void handleResendOtp()}
                          disabled={authLoading}
                        >
                          Kirim Ulang Kode
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </section>
            ) : (
              <div className="two-col-grid">
                <section className="section-card">
                  <div>
                    <h2>Masuk</h2>
                    <p className="muted-text">Masuk ke akun Aquaku untuk mulai bertransaksi.</p>
                  </div>
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
                      <span>Kata Sandi</span>
                      <input
                        type="password"
                        required
                        placeholder="Masukkan kata sandi"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                      />
                    </label>
                    <button type="submit" className="button-primary" disabled={authLoading}>
                      {authLoading ? "Memproses..." : "Masuk"}
                    </button>
                  </form>
                </section>

                <section className="section-card">
                  <div>
                    <h2>Daftar Akun Baru</h2>
                    <p className="muted-text">Gabung bersama komunitas aquascape Semarang.</p>
                  </div>
                  <form className="form-stack" onSubmit={handleRegister}>
                    <label className="field">
                      <span>Nama Lengkap atau Nama Toko</span>
                      <input
                        type="text"
                        required
                        maxLength={80}
                        placeholder="Contoh: Kebun Air Semarang"
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
                      <span>Nomor WhatsApp / HP</span>
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
                      <span>Kata Sandi</span>
                      <input
                        type="password"
                        required
                        minLength={12}
                        maxLength={128}
                        placeholder="Minimal 12 karakter"
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                      />
                    </label>
                    <button type="submit" className="button-secondary" disabled={authLoading}>
                      {authLoading ? "Mendaftarkan..." : "Buat Akun"}
                    </button>
                  </form>
                </section>
              </div>
            )}
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
          <span>Lapakku</span>
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
          <span>Bantuan</span>
        </button>
        {isAdmin && (
          <button
            type="button"
            className={`mobile-nav-item ${activeTab === "admin" ? "active" : ""}`}
            onClick={() => setActiveTab("admin")}
          >
            <Icon name="shield" />
            <span>Admin</span>
          </button>
        )}
        <button
          type="button"
          className={`mobile-nav-item ${activeTab === "account" ? "active" : ""}`}
          onClick={() => setActiveTab("account")}
        >
          <Icon name="user" />
          <span>Akun</span>
        </button>
      </nav>

      {/* Modal Detail Produk */}
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
              <p className="detail-message">Memuat informasi produk...</p>
            ) : detailError ? (
              <div className="detail-content">
                <p className="error-text" role="alert">
                  {detailError}
                </p>
                <p className="muted-text">Produk ini mungkin sudah terjual atau tidak lagi tersedia.</p>
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
                      <Icon name="pin" /> {selectedListing.location.kelurahan}, {selectedListing.location.district}
                    </span>
                    <span>
                      Penjual: <strong>{selectedListing.seller.display_name || "Penjual Aquaku"}</strong>
                      {selectedListing.seller.verified_store ? " · ✓ Toko Terverifikasi" : ""}
                    </span>
                    <span>Ditayangkan {formatDate(selectedListing.created_at)}</span>
                  </div>

                  <div className="modal-actions">
                    {selectedListing.seller.whatsapp_url && (
                      <a
                        className="button-primary contact-button"
                        href={selectedListing.seller.whatsapp_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Hubungi via WhatsApp
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
                        Profil Penjual
                      </button>
                      <button
                        type="button"
                        className="button-secondary"
                        onClick={() => prefillReport("LISTING", selectedListing.id)}
                      >
                        Laporkan Iklan
                      </button>
                      {isAdmin && (
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
                          Moderasi
                        </button>
                      )}
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
          {listing.seller.verified_store && <span className="verified-tag">✓ Terverifikasi</span>}
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
