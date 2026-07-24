export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-10 text-sm text-muted-foreground sm:flex-row">
        <p>&copy; {new Date().getFullYear()} Medosha. All rights reserved.</p>
        <p>Building the construction industry&apos;s digital ecosystem.</p>
      </div>
    </footer>
  );
}
