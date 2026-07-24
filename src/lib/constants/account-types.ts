import {
  Building2,
  GraduationCap,
  HardHat,
  Landmark,
  Package,
  School,
  User,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

import type { AccountType } from "@/types/database.types";

export const ACCOUNT_TYPES: {
  value: AccountType;
  label: string;
  description: string;
  icon: LucideIcon;
}[] = [
  {
    value: "individual",
    label: "Individual",
    description: "Architect, engineer, designer, or other professional",
    icon: User,
  },
  {
    value: "company",
    label: "Company",
    description: "Firm, agency, or real estate company",
    icon: Building2,
  },
  {
    value: "contractor",
    label: "Contractor",
    description: "General or specialty contractor",
    icon: HardHat,
  },
  {
    value: "developer",
    label: "Developer",
    description: "Real estate or construction developer",
    icon: Landmark,
  },
  {
    value: "supplier",
    label: "Supplier",
    description: "Materials, hardware, or equipment supplier",
    icon: Warehouse,
  },
  {
    value: "manufacturer",
    label: "Manufacturer",
    description: "Furniture, fixtures, or materials manufacturer",
    icon: Package,
  },
  {
    value: "government",
    label: "Government",
    description: "Municipal, regional, or national agency",
    icon: Landmark,
  },
  {
    value: "university",
    label: "University",
    description: "Academic or research institution",
    icon: School,
  },
  {
    value: "student",
    label: "Student",
    description: "Studying architecture, engineering, or trades",
    icon: GraduationCap,
  },
];

export const ACCOUNT_TYPE_MAP = Object.fromEntries(
  ACCOUNT_TYPES.map((t) => [t.value, t]),
) as Record<AccountType, (typeof ACCOUNT_TYPES)[number]>;
