import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { ThemeQuickToggle } from "@/components/ThemeSync";

interface TocItem {
  id: string;
  label: string;
}

interface LegalPageShellProps {
  badgeIcon: ReactNode;
  badgeLabel: string;
  title: string;
  subtitle: string;
  metaText: string;
  toc?: TocItem[];
  currentPath: "/ketentuan" | "/privasi" | "/lisensi" | "/kontak";
  children: ReactNode;
}

const FOOTER_LINKS: Array<{
  href: "/ketentuan" | "/privasi" | "/lisensi" | "/kontak";
  label: string;
}> = [
  { href: "/ketentuan", label: "Ketentuan" },
  { href: "/privasi", label: "Privasi" },
  { href: "/lisensi", label: "Lisensi & Atribusi" },
  { href: "/kontak", label: "Kontak & Bantuan" },
];

export function LegalPageShell({
  badgeIcon,
  badgeLabel,
  title,
  subtitle,
  metaText,
  toc,
  currentPath,
  children,
}: LegalPageShellProps) {
  return (
    <div className="min-h-screen bg-canvas px-4 py-8 pb-16 text-ink sm:px-8 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/"
            className="btn-tactile inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3.5 py-1.5 text-xs font-medium text-ink-body transition-colors hover:border-accent-soft/45 hover:text-heading"
          >
            <ArrowLeft className="h-3.5 w-3.5 text-accent-soft" />
            Kembali ke SmartSari
          </Link>

          <ThemeQuickToggle />
        </div>

        <header className="mb-8 border-b border-line pb-7">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent-tint">
            {badgeIcon}
            <span>{badgeLabel}</span>
          </div>
          <h1 className="text-3xl font-bold leading-[1.15] tracking-[-0.03em] text-heading sm:text-4xl">
            {title}
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-7 text-ink-body">
            {subtitle}
          </p>
          <p className="mt-4 font-mono text-[11px] font-medium text-ink-muted">
            {metaText}
          </p>

          {toc && toc.length > 0 && (
            <nav
              aria-label="Daftar isi halaman"
              className="mt-5 flex flex-wrap gap-1.5"
            >
              {toc.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className="rounded-full border border-line-strong bg-surface px-3 py-1 text-[11px] font-medium text-ink-secondary transition-colors hover:border-accent-soft/45 hover:text-heading"
                >
                  {item.label}
                </a>
              ))}
            </nav>
          )}
        </header>

        <main>{children}</main>

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6 text-xs text-ink-muted">
          <span>
            &copy; 2026 <strong className="font-semibold text-ink-body">SmartSari by AirEvo</strong>. Seluruh hak cipta dilindungi.
          </span>
          <nav aria-label="Navigasi hukum dan bantuan" className="flex flex-wrap items-center gap-4">
            {FOOTER_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={
                  currentPath === link.href
                    ? "font-semibold text-accent-soft"
                    : "transition-colors hover:text-accent-soft"
                }
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </footer>
      </div>
    </div>
  );
}
