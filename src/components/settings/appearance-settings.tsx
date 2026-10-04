"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

import { cn } from "@/lib/utils";

const choices = [
  { value: "light", label: "Light", hint: "Blue and white", icon: Sun },
  { value: "dark", label: "Dark", hint: "Dark navy", icon: Moon },
  { value: "system", label: "Device", hint: "Follow your device", icon: Monitor },
] as const;

const subscribe = () => () => {};

export function AppearanceSettings() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);

  return (
    <section className="space-y-4 rounded-2xl border border-blue-100 bg-card p-4 shadow-sm sm:p-6 dark:border-blue-900">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Appearance</h2>
        <p className="text-sm text-muted-foreground">Use Medosha in light or dark colors.</p>
      </div>
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Color theme">
        {choices.map(({ value, label, hint, icon: Icon }) => {
          const active = mounted && theme === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              onClick={() => setTheme(value)}
              className={cn(
                "flex min-h-24 flex-col items-center justify-center gap-1 rounded-xl border p-2 text-center transition-colors",
                active
                  ? "border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                  : "border-border hover:border-blue-300 hover:bg-blue-50/60 dark:hover:bg-blue-950/40",
              )}
            >
              <Icon className="size-5" />
              <span className="text-sm font-semibold">{label}</span>
              <span className="text-[10px] text-muted-foreground">{hint}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
