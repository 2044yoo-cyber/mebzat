import type { Profile } from "@/types/database.types";

const WEIGHTS: {
  weight: number;
  label: string;
  filled: (p: Profile) => boolean;
}[] = [
  { weight: 15, label: "Account type", filled: (p) => !!p.account_type },
  { weight: 15, label: "Profile photo", filled: (p) => !!p.avatar_url },
  { weight: 15, label: "Bio", filled: (p) => !!p.bio },
  { weight: 15, label: "Location", filled: (p) => !!(p.location_city || p.location_country) },
  { weight: 10, label: "Username", filled: (p) => !!p.username },
  { weight: 10, label: "Phone number", filled: (p) => !!p.phone },
  { weight: 10, label: "Website", filled: (p) => !!p.website },
  { weight: 5, label: "Years of experience", filled: (p) => p.years_experience != null },
  { weight: 5, label: "Languages", filled: (p) => p.languages.length > 0 },
];

export function getProfileCompletion(profile: Profile) {
  let percent = 0;
  const missing: string[] = [];

  for (const item of WEIGHTS) {
    if (item.filled(profile)) {
      percent += item.weight;
    } else {
      missing.push(item.label);
    }
  }

  return { percent, missing };
}
