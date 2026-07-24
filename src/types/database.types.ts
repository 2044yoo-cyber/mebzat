// Hand-authored to match supabase/migrations/0001_init_profiles.sql and
// 0002_progressive_profile.sql.
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

export interface Database {
  public: {
    Views: Record<string, never>;
    Functions: Record<string, never>;
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
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
  };
}

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];
