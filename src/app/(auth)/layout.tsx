import { Logo } from "@/components/layout/logo";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center gap-8 px-6 py-16">
      <Logo />
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
