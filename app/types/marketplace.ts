export type ApiEnvelope<T> = {
  data: T;
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
  minimum_tier: "personal" | "toko" | "juragan";
};

export type Region = {
  code: string;
  district_code: string;
  district: string;
  kelurahan: string;
};

export type Listing = {
  id: string;
  title: string;
  description: string;
  price: number;
  condition: Condition;
  status: "active" | "sold" | "expired" | "inactive";
  category: Category;
  location: Region;
  photos: Array<{ id: string; url: string | null }>;
  seller: {
    id: string;
    display_name?: string;
    avatar_url?: string | null;
    tier?: "personal" | "toko" | "juragan";
    verified_store?: boolean;
    whatsapp_url?: string | null;
  };
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
