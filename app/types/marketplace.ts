export type ApiEnvelope<T> = {
  data: T;
};

export type UserTier = "personal" | "toko" | "juragan";
export type UserRole = "member" | "admin";

export type UserProfile = {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  phone_verified: boolean;
  tier: UserTier;
  tier_expires_at: string | null;
  verified_store: boolean;
  role: UserRole;
  created_at: string;
};

export type RegisterResponse = {
  data: UserProfile;
  development_otp?: string;
};

export type TokenPair = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: UserProfile;
};

export type OtpResendData = {
  development_otp?: string;
};

export type PublicProfile = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  tier: UserTier;
  verified_store: boolean;
  rating_average: number | null;
  rating_count: number;
  active_listing_count: number;
  bio: string | null;
};

export type Category = {
  id: string;
  slug: string;
  name: string;
};

export type Condition = "BNIB" | "NEW" | "LIKE_NEW" | "SECOND";

export type Tag = {
  id: string;
  slug: string;
  name: string;
  minimum_tier: UserTier;
};

export type Region = {
  code: string;
  district_code: string;
  district: string;
  kelurahan: string;
};

export type ListingStatus = "active" | "sold" | "expired" | "inactive";

export type Listing = {
  id: string;
  title: string;
  description: string;
  price: number;
  condition: Condition;
  status: ListingStatus;
  category: Category;
  location: Region;
  photos: Array<{ id: string; url: string | null }>;
  seller: {
    id: string;
    display_name?: string;
    avatar_url?: string | null;
    tier?: UserTier;
    verified_store?: boolean;
    shop?: Record<string, unknown> | null;
    whatsapp_url?: string | null;
  };
  expires_at?: string;
  suspended_at?: string | null;
  suspension_reason?: "tier_condition" | "quota" | null;
  moderation_hidden_at?: string | null;
  moderation_reason?: string | null;
  created_at: string;
  updated_at: string;
};

export type ListingPage = {
  items: Listing[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
};

export type Taxonomy = {
  categories: Category[];
  tags: Tag[];
};

export type CreateListingInput = {
  category_id: string;
  region_code: string;
  shop_id?: string;
  title: string;
  description: string;
  price: number;
  condition: Condition;
  photo_ids: string[];
  cooldown_pass_id?: string;
};

export type UpdateListingInput = {
  category_id?: string;
  region_code?: string;
  title?: string;
  description?: string;
  price?: number;
  condition?: Condition;
  photo_ids?: string[];
};

export type UploadSignatureData = {
  asset_id: string;
  cloud_name: string;
  api_key: string;
  timestamp: number;
  public_id: string;
  folder: string;
  allowed_formats: "jpg,png,webp";
  upload_preset: string;
  overwrite: "false";
  signature: string;
};

export type Quota = {
  tier: UserTier;
  active_listings: number;
  inactive_listings: number;
  base_quota: number;
  addon_slots: number;
  total_quota: number;
  available_slots: number;
  available_cooldown_passes: number;
  cooldown_until: string | null;
  may_list: boolean;
  may_list_with_cooldown_pass: boolean;
};

export type TransactionStatus =
  | "awaiting_confirmation"
  | "confirmed"
  | "rejected"
  | "cancelled";

export type MarkSoldData = {
  id: string;
  status: "sold";
  sold_at: string;
  transaction: {
    id: string;
    buyer_id: string;
    status: "awaiting_confirmation";
  } | null;
};

export type Rating = {
  id: string;
  score: number;
  created_at: string;
};

export type UserSummary = {
  id: string;
  display_name: string;
};

export type SaleTransaction = {
  id: string;
  listing: {
    id: string;
    title: string;
    price: number;
  };
  seller: UserSummary;
  buyer: UserSummary;
  status: TransactionStatus;
  response_note: string | null;
  responded_at: string | null;
  rating: Rating | null;
  created_at: string;
};

export type BuyerDecision = "CONFIRM" | "REJECT";

export type ReportTargetType = "LISTING" | "USER";

export type ReportReason =
  | "SPAM"
  | "SCAM"
  | "PROHIBITED_ITEM"
  | "MISLEADING"
  | "HARASSMENT"
  | "OTHER";

export type ReportReasonResponse =
  | "spam"
  | "scam"
  | "prohibited_item"
  | "misleading"
  | "harassment"
  | "other";

export type ReportStatus = "open" | "resolved" | "dismissed";
export type AdminReportFilterStatus = "OPEN" | "RESOLVED" | "DISMISSED";
export type AdminReportDecision = "RESOLVED" | "DISMISSED";

export type Report = {
  id: string;
  reporter: UserSummary;
  target: {
    type: "listing" | "user";
    id: string;
    title?: string;
    display_name?: string;
  } | null;
  reason: ReportReasonResponse;
  details: string | null;
  status: ReportStatus;
  review_note: string | null;
  reviewed_by: UserSummary | null;
  reviewed_at: string | null;
  listing_hidden: boolean;
  created_at: string;
};

export type ModerationActionType = "HIDE" | "RESTORE";

export type ModerationAction = {
  id: string;
  action: "hide" | "restore";
  reason: string;
  admin: UserSummary;
  created_at: string;
};

export type ModerationResult = {
  id: string;
  hidden: boolean;
  moderation_reason: string | null;
};

export type SaleCorrection = {
  id: string;
  action: "buyer_corrected";
  reason: string;
  admin: UserSummary;
  previous_buyer: UserSummary;
  new_buyer: UserSummary;
  created_at: string;
};
