"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Bot, Box, Calculator, FileText, HardHat, House, Search, ShoppingCart, SlidersHorizontal } from "lucide-react";
import { useLanguage } from "@/components/i18n/language-provider";

const copy = {
  en: { title: "Build a Better", place: "Ethiopia", sectors: "Construction · Real Estate · Professionals · AI", subtitle: "All in one platform.", explore: "Explore Now", dream: "Dream. Plan. Build.", search: "Search Medosha", searchHint: "Properties, materials, professionals…", cost: "Construction Cost", costHint: "Estimate your project cost instantly", boq: "BOQ Generator", boqHint: "From plan to detailed takeoff and Excel", ai: "Medosha AI", property: "Real Estate", professionals: "Professionals", materials: "Materials", tours: "3D & 360°", projects: "Projects", aiHint: "Design · BOQ · Advice", propertyHint: "Buy · Rent · Invest", professionalsHint: "Find · Hire · Work", materialsHint: "Compare · Buy", toursHint: "View · Upload", projectsHint: "Manage · Collaborate" },
  am: { title: "የተሻለች", place: "ኢትዮጵያን እንገንባ", sectors: "ግንባታ · ሪል እስቴት · ባለሙያዎች · AI", subtitle: "ሁሉም በአንድ መድረክ።", explore: "አሁን ያስሱ", dream: "አልም። እቅድ አውጣ። ገንባ።", search: "መዶሻን ፈልግ", searchHint: "ንብረቶች፣ ቁሳቁሶች፣ ባለሙያዎች…", cost: "የግንባታ ወጪ", costHint: "የፕሮጀክትዎን ወጪ ይገምቱ", boq: "የሥራ ዝርዝር", boqHint: "ከፕላን ወደ ዝርዝር መጠንና Excel", ai: "መዶሻ AI", property: "ሪል እስቴት", professionals: "ባለሙያዎች", materials: "ቁሳቁሶች", tours: "3D እና 360°", projects: "ፕሮጀክቶች", aiHint: "ንድፍ · ምክር", propertyHint: "ግዛ · ተከራይ", professionalsHint: "ፈልግ · ቅጠር", materialsHint: "አወዳድር · ግዛ", toursHint: "ተመልከት · ስቀል", projectsHint: "አስተዳድር · ተባበር" },
  om: { title: "Itoophiyaa fooyyaate", place: "Waliin haa ijaarru", sectors: "Ijaarsa · Manaa fi lafa · Ogeeyyii · AI", subtitle: "Hunduu waltajjii tokko irratti.", explore: "Amma ilaali", dream: "Abjoodhu. Karoorsi. Ijaari.", search: "Medosha barbaadi", searchHint: "Qabeenya, meeshaalee, ogeeyyii…", cost: "Baasii ijaarsaa", costHint: "Baasii pirojektii kee tilmaami", boq: "Qopheessaa BOQ", boqHint: "Karoora irraa gara safaraa fi Excel", ai: "Medosha AI", property: "Manaa fi lafa", professionals: "Ogeeyyii", materials: "Meeshaalee", tours: "3D fi 360°", projects: "Pirojektoota", aiHint: "Dizaayinii · Gorsa", propertyHint: "Biti · Kireeffadhu", professionalsHint: "Barbaadi · Qacari", materialsHint: "Madaali · Biti", toursHint: "Ilaali · Olkaa’i", projectsHint: "Bulchi · Waliin hojjedhu" },
};

export function HomeFront() {
  const { language } = useLanguage();
  const c = copy[language];
  const services = [
    { href: "/ai", icon: Bot, label: c.ai, hint: c.aiHint },
    { href: "/city", icon: House, label: c.property, hint: c.propertyHint },
    { href: "/professionals", icon: HardHat, label: c.professionals, hint: c.professionalsHint },
    { href: "/marketplace?category=construction-materials", icon: ShoppingCart, label: c.materials, hint: c.materialsHint },
    { href: "/tours", icon: Box, label: c.tours, hint: c.toursHint },
    { href: "/projects", icon: FileText, label: c.projects, hint: c.projectsHint },
  ];
  return (
    <div className="space-y-3 px-3 pb-3 sm:space-y-4">
      <Link href="/search" className="flex min-h-12 items-center gap-3 rounded-2xl border border-blue-200/60 bg-background px-3 text-muted-foreground shadow-sm lg:hidden">
        <Search className="size-5 shrink-0 text-blue-600" />
        <span className="min-w-0 flex-1 truncate text-sm">{c.search}<span className="hidden sm:inline"> — {c.searchHint}</span></span>
        <SlidersHorizontal className="size-5 shrink-0 text-blue-600" aria-hidden />
      </Link>
      <section className="relative isolate overflow-hidden rounded-2xl bg-blue-50 shadow-sm" aria-label={c.title + " " + c.place}>
        <Image src="/medosha_construction_hero.webp" alt="" fill sizes="(max-width: 1024px) 100vw, 960px" className="object-cover object-[65%_55%]" preload />
        <div className="absolute inset-0 bg-gradient-to-r from-blue-50 via-blue-50/85 to-transparent sm:via-blue-50/50" />
        <div className="relative flex min-h-52 flex-col items-start justify-center px-4 py-5 sm:min-h-60 sm:px-7">
          <h1 className="max-w-[75%] text-3xl leading-[1.05] font-extrabold tracking-tight text-slate-950 sm:text-4xl">{c.title}<br /><span className="text-blue-700">{c.place}</span></h1>
          <p className="mt-3 max-w-[80%] text-xs font-semibold text-slate-800 sm:text-sm">{c.sectors}</p>
          <p className="mt-1 text-xs text-slate-700 sm:text-sm">{c.subtitle}</p>
          <Link href="/marketplace" className="mt-3 inline-flex min-h-11 items-center gap-3 rounded-full bg-blue-600 px-5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700">{c.explore}<ArrowRight className="size-4" /></Link>
        </div>
        <p className="absolute top-5 right-5 hidden max-w-24 -rotate-12 text-center font-serif text-2xl italic text-blue-950 md:block">{c.dream}</p>
      </section>
      <nav aria-label={c.sectors} className="flex overflow-x-auto rounded-2xl bg-blue-50/80 py-3 [scrollbar-width:none] dark:bg-blue-950/30">
        {services.map(({ href, icon: Icon, label, hint }) => (
          <Link key={href} href={href} className="flex min-w-24 flex-1 flex-col items-center gap-1 border-r border-blue-200/50 px-2 text-center last:border-0 hover:bg-blue-100/60 dark:hover:bg-blue-900/40">
            <Icon className="mb-1 size-7 text-blue-600 sm:size-9" strokeWidth={2.3} />
            <span className="text-[11px] font-semibold sm:text-xs">{label}</span>
            <span className="whitespace-nowrap text-[9px] text-muted-foreground sm:text-[10px]">{hint}</span>
          </Link>
        ))}
      </nav>
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        {[
          { href: "/calculators/construction-cost", icon: Calculator, title: c.cost, hint: c.costHint },
          { href: "/calculators/boq", icon: FileText, title: c.boq, hint: c.boqHint },
        ].map(({ href, icon: Icon, title, hint }) => (
          <Link key={href} href={href} className="flex items-center gap-2 rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50/60 to-background p-3 hover:border-blue-400 sm:gap-3 dark:border-blue-900 dark:from-blue-950/30">
            <span className="hidden rounded-xl bg-blue-100 p-2 sm:block dark:bg-blue-900"><Icon className="size-8 text-blue-600" /></span>
            <span className="min-w-0 flex-1"><span className="block text-xs font-semibold sm:text-base">{title}</span><span className="mt-1 block text-[10px] leading-relaxed text-muted-foreground sm:text-xs">{hint}</span></span>
            <ArrowRight className="size-6 shrink-0 rounded-full bg-blue-600 p-1 text-white" />
          </Link>
        ))}
      </div>
    </div>
  );
}
