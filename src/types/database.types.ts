// Hand-authored to match supabase/migrations/0001_init_profiles.sql through
// 0005_marketplace.sql.
// Once the Supabase project is linked, regenerate with:
//   npx supabase gen types typescript --linked > src/types/database.types.ts

export type AccountType =
  | "individual"
  | "company"
  | "supplier"
  | "manufacturer"
  | "contractor"
  | "developer"
  | "government"
  | "university"
  | "student";

export type VerificationStatus = "unverified" | "pending" | "verified";

export type ProjectStatus = "draft" | "published";

export type BuildingType =
  | "residential"
  | "commercial"
  | "industrial"
  | "hospitality"
  | "institutional"
  | "mixed_use"
  | "landscape"
  | "interior"
  | "renovation"
  | "other";

export type ProductStatus = "draft" | "published";

export type StockStatus = "in_stock" | "made_to_order" | "out_of_stock";

export interface Database {
  public: {
    Views: Record<string, never>;
    Functions: {
      increment_profile_views: {
        Args: { profile_id: string };
        Returns: undefined;
      };
      increment_project_views: {
        Args: { project_id: string };
        Returns: undefined;
      };
      increment_product_views: {
        Args: { product_id: string };
        Returns: undefined;
      };
    };
    Tables: {
      profiles: {
        Row: {
          id: string;
          account_type: AccountType | null;
          username: string | null;
          full_name: string | null;
          company_name: string | null;
          email: string | null;
          phone: string | null;
          phone_verified: boolean;
          avatar_url: string | null;
          cover_url: string | null;
          bio: string | null;
          website: string | null;
          location_city: string | null;
          location_country: string | null;
          latitude: number | null;
          longitude: number | null;
          years_experience: number | null;
          languages: string[];
          verification_status: VerificationStatus;
          onboarding_completed: boolean;
          onboarding_step: number;
          profile_views: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          account_type?: AccountType | null;
          username?: string | null;
          full_name?: string | null;
          company_name?: string | null;
          email: string | null;
          phone?: string | null;
          phone_verified?: boolean;
          avatar_url?: string | null;
          cover_url?: string | null;
          bio?: string | null;
          website?: string | null;
          location_city?: string | null;
          location_country?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          years_experience?: number | null;
          languages?: string[];
          verification_status?: VerificationStatus;
          onboarding_completed?: boolean;
          onboarding_step?: number;
          profile_views?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          account_type?: AccountType | null;
          username?: string | null;
          full_name?: string | null;
          company_name?: string | null;
          email?: string;
          phone?: string | null;
          phone_verified?: boolean;
          avatar_url?: string | null;
          cover_url?: string | null;
          bio?: string | null;
          website?: string | null;
          location_city?: string | null;
          location_country?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          years_experience?: number | null;
          languages?: string[];
          verification_status?: VerificationStatus;
          onboarding_completed?: boolean;
          onboarding_step?: number;
          profile_views?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      projects: {
        Row: {
          id: string;
          owner_id: string;
          title: string;
          slug: string;
          description: string | null;
          location_city: string | null;
          location_country: string | null;
          building_type: BuildingType | null;
          style: string | null;
          bedrooms: number | null;
          floors: number | null;
          budget: number | null;
          budget_currency: string;
          materials: string[];
          completion_date: string | null;
          client: string | null;
          cover_image_url: string | null;
          status: ProjectStatus;
          views: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          title: string;
          slug: string;
          description?: string | null;
          location_city?: string | null;
          location_country?: string | null;
          building_type?: BuildingType | null;
          style?: string | null;
          bedrooms?: number | null;
          floors?: number | null;
          budget?: number | null;
          budget_currency?: string;
          materials?: string[];
          completion_date?: string | null;
          client?: string | null;
          cover_image_url?: string | null;
          status?: ProjectStatus;
          views?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          title?: string;
          slug?: string;
          description?: string | null;
          location_city?: string | null;
          location_country?: string | null;
          building_type?: BuildingType | null;
          style?: string | null;
          bedrooms?: number | null;
          floors?: number | null;
          budget?: number | null;
          budget_currency?: string;
          materials?: string[];
          completion_date?: string | null;
          client?: string | null;
          cover_image_url?: string | null;
          status?: ProjectStatus;
          views?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      project_images: {
        Row: {
          id: string;
          project_id: string;
          url: string;
          caption: string | null;
          position: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          url: string;
          caption?: string | null;
          position?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          url?: string;
          caption?: string | null;
          position?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      product_categories: {
        Row: {
          id: string;
          slug: string;
          name: string;
          icon: string | null;
          position: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          icon?: string | null;
          position?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          icon?: string | null;
          position?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      products: {
        Row: {
          id: string;
          owner_id: string;
          category_id: string | null;
          title: string;
          slug: string;
          description: string | null;
          brand: string | null;
          price: number | null;
          currency: string;
          unit: string | null;
          stock_status: StockStatus;
          specs: Record<string, string>;
          location_city: string | null;
          location_country: string | null;
          delivery_available: boolean;
          cover_image_url: string | null;
          status: ProductStatus;
          views: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          category_id?: string | null;
          title: string;
          slug: string;
          description?: string | null;
          brand?: string | null;
          price?: number | null;
          currency?: string;
          unit?: string | null;
          stock_status?: StockStatus;
          specs?: Record<string, string>;
          location_city?: string | null;
          location_country?: string | null;
          delivery_available?: boolean;
          cover_image_url?: string | null;
          status?: ProductStatus;
          views?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          category_id?: string | null;
          title?: string;
          slug?: string;
          description?: string | null;
          brand?: string | null;
          price?: number | null;
          currency?: string;
          unit?: string | null;
          stock_status?: StockStatus;
          specs?: Record<string, string>;
          location_city?: string | null;
          location_country?: string | null;
          delivery_available?: boolean;
          cover_image_url?: string | null;
          status?: ProductStatus;
          views?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      product_images: {
        Row: {
          id: string;
          product_id: string;
          url: string;
          caption: string | null;
          position: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          url: string;
          caption?: string | null;
          position?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          url?: string;
          caption?: string | null;
          position?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      product_favorites: {
        Row: {
          id: string;
          user_id: string;
          product_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          product_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          product_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
    };
  };
}

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];
export type Project = Database["public"]["Tables"]["projects"]["Row"];
export type ProjectImage =
  Database["public"]["Tables"]["project_images"]["Row"];
export type ProductCategory =
  Database["public"]["Tables"]["product_categories"]["Row"];
export type Product = Database["public"]["Tables"]["products"]["Row"];
export type ProductImage =
  Database["public"]["Tables"]["product_images"]["Row"];
export type ProductFavorite =
  Database["public"]["Tables"]["product_favorites"]["Row"];
