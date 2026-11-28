"use client";

import Link from "next/link";
import { useState } from "react";
import { useBodyScrollLock } from "@/lib/use-scroll-lock";
import {
  AlertTriangle,
  Check,
  Cloud,
  Database,
  Eye,
  EyeOff,
  FileCheck2,
  HelpCircle,
  Loader2,
  Lock,
  LogOut,
  Mail,
  Monitor,
  Moon,
  Palette,
  RefreshCw,
  Scale,
  Settings,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Trash2,
  User,
  X,
  Zap,
} from "lucide-react";
import {
  PALETTE_OPTIONS,
  getStoredAppearance,
  saveAppearance,
  saveSearchPrefs,
  type AppearancePrefs,
  type DefaultTierPreset,
  type SearchDefaultPrefs,
  type ThemePreference,
} from "@/lib/appearance";
import type { AuthUser, DailyQuotaStatus, SortOption } from "@/lib/types";

export type SettingsTabId = "general" | "account" | "privacy";

interface SettingsModalProps {
  user: AuthUser | null;
  initialTab?: SettingsTabId;
  quotaStatus: DailyQuotaStatus | null;
  onRefreshQuota: () => Promise<void>;
  searchPrefs: SearchDefaultPrefs;
  onSearchPrefsChange: (prefs: SearchDefaultPrefs) => void;
  onOpenAuth: () => void;
  onOpenShortcuts: () => void;
  onClearLocalCache: () => void;
  onClose: () => void;
  onProfileUpdated: (user: AuthUser) => void;
  onLogout: () => Promise<void>;
  onLoggedOutAll: () => void;
  onAccountDeleted: () => void;
}

export function SettingsModal({
  user,
  initialTab = "general",
  quotaStatus,
  onRefreshQuota,
  searchPrefs,
  onSearchPrefsChange,
  onOpenAuth,
  onOpenShortcuts,
  onClearLocalCache,
  onClose,
  onProfileUpdated,
  onLogout,
  onLoggedOutAll,
  onAccountDeleted,
}: SettingsModalProps) {
  const [tab, setTab] = useState<SettingsTabId>(initialTab);
  const [appearance, setAppearance] = useState<AppearancePrefs>(() =>
    getStoredAppearance()
  );
  const [localSearchPrefs, setLocalSearchPrefs] =
    useState<SearchDefaultPrefs>(searchPrefs);
  const [refreshingQuota, setRefreshingQuota] = useState(false);

  const [name, setName] = useState(user?.name ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);

  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");

  const [loading, setLoading] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [loggingOutAll, setLoggingOutAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleAppearanceChange = (patch: Partial<AppearancePrefs>) => {
    const next = { ...appearance, ...patch };
    setAppearance(next);
    saveAppearance(next);
  };

  const handleSearchPrefPatch = (patch: Partial<SearchDefaultPrefs>) => {
    const next = { ...localSearchPrefs, ...patch };
    setLocalSearchPrefs(next);
    saveSearchPrefs(next);
    onSearchPrefsChange(next);
    setSuccess("Preferensi pencarian default tersimpan.");
    setError(null);
  };

  const handleRefreshQuotaClick = async () => {
    setRefreshingQuota(true);
    try {
      await onRefreshQuota();
    } finally {
      setRefreshingQuota(false);
    }
  };

  const handleUpdateName = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError("Nama minimal 2 karakter.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = (await res.json()) as { user?: AuthUser; error?: string };
      if (!res.ok || !data.user) {
        setError(data.error || "Gagal memperbarui nama profil.");
        return;
      }
      onProfileUpdated(data.user);
      setSuccess("Nama profil berhasil diperbarui.");
    } catch {
      setError("Gagal menghubungi server.");
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (
      newPassword.length < 8 ||
      newPassword.length > 72 ||
      !/[A-Za-z]/.test(newPassword) ||
      !/[0-9]/.test(newPassword)
    ) {
      setError(
        "Kata sandi baru wajib 8–72 karakter dengan kombinasi huruf dan angka."
      );
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Konfirmasi kata sandi baru tidak cocok.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = (await res.json()) as { user?: AuthUser; error?: string };
      if (!res.ok || !data.user) {
        setError(data.error || "Gagal memperbarui kata sandi.");
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess(
        "Kata sandi berhasil diperbarui. Semua sesi di perangkat lain telah dicabut."
      );
    } catch {
      setError("Gagal menghubungi server.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogoutCurrent = async () => {
    setError(null);
    setSuccess(null);
    setLoggingOut(true);
    try {
      await onLogout();
      onClose();
    } catch {
      setError("Gagal keluar dari akun.");
    } finally {
      setLoggingOut(false);
    }
  };

  const handleLogoutAll = async () => {
    setError(null);
    setSuccess(null);
    setLoggingOutAll(true);
    try {
      const res = await fetch("/api/auth/logout-all", { method: "POST" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error || "Gagal mengeluarkan semua perangkat.");
        return;
      }
      onLoggedOutAll();
    } catch {
      setError("Gagal menghubungi server.");
    } finally {
      setLoggingOutAll(false);
    }
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (deleteConfirm.trim() !== "HAPUS") {
      setError('Ketik "HAPUS" dengan huruf kapital untuk konfirmasi.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: deletePassword,
          confirmText: "HAPUS",
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error || "Gagal menghapus akun.");
        return;
      }
      onAccountDeleted();
    } catch {
      setError("Gagal menghubungi server.");
    } finally {
      setLoading(false);
    }
  };

  const quotaPercent =
    quotaStatus && quotaStatus.limit > 0
      ? Math.min(
          100,
          Math.round((quotaStatus.remaining / quotaStatus.limit) * 100)
        )
      : 0;

  useBodyScrollLock(true);

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center overscroll-contain bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Pengaturan SmartSari"
    >
      <div className="animate-modal-in max-h-[92vh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-2xl border border-line-strong bg-surface p-5 text-ink shadow-2xl sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent-soft">
              <Settings className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-heading">
                Pengaturan SmartSari
              </h2>
              <p className="truncate text-xs text-ink-secondary">
                {user ? user.email : "Mode Tamu · Pengaturan tersimpan di perangkat ini"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup pengaturan"
            className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-ink-secondary hover:bg-elevated hover:text-heading"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-5 grid grid-cols-3 gap-1 rounded-xl border border-line bg-canvas p-1">
          {(
            [
              { id: "general", label: "Tampilan" },
              { id: "account", label: "Akun & Sandi" },
              { id: "privacy", label: "Data & Privasi" },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setTab(item.id);
                setError(null);
                setSuccess(null);
              }}
              className={`min-h-[36px] rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors ${
                tab === item.id
                  ? "bg-accent text-white"
                  : "text-ink-secondary hover:text-heading"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === "general" && (
          <div className="space-y-5">
            {/* Live Daily AI Quota */}
            <section className="rounded-xl border border-line-strong bg-canvas p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-accent-soft" />
                  <span className="text-xs font-semibold text-heading">
                    Kuota AI Harian
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="rounded-full border border-line-strong bg-surface px-2 py-0.5 text-[10px] font-medium text-ink-secondary">
                    {user ? "Akun Terdaftar · 100×/hari" : "Mode Tamu · 3×/hari"}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleRefreshQuotaClick()}
                    disabled={refreshingQuota}
                    aria-label="Muat ulang kuota"
                    title="Segarkan sisa kuota"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-line-strong bg-surface text-ink-secondary hover:border-accent-soft/45 hover:text-heading disabled:opacity-50"
                  >
                    <RefreshCw
                      className={`h-3 w-3 ${refreshingQuota ? "animate-spin" : ""}`}
                    />
                  </button>
                </div>
              </div>

              {quotaStatus ? (
                <>
                  <div className="mb-1.5 flex items-baseline justify-between">
                    <span
                      className={`font-mono text-lg font-bold tabular-nums ${
                        quotaStatus.remaining === 0
                          ? "text-danger"
                          : quotaStatus.remaining <= 2
                            ? "text-warn"
                            : "text-ok"
                      }`}
                    >
                      {quotaStatus.remaining}
                      <span className="text-xs font-medium text-ink-muted">
                        {" "}
                        / {quotaStatus.limit} tersisa hari ini
                      </span>
                    </span>
                    <span className="font-mono text-[11px] text-ink-muted">
                      {quotaPercent}%
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-elevated">
                    <div
                      className={`h-full rounded-full transition-all ${
                        quotaStatus.remaining === 0
                          ? "bg-danger"
                          : quotaStatus.remaining <= 2
                            ? "bg-warn"
                            : "bg-accent"
                      }`}
                      style={{ width: `${quotaPercent}%` }}
                    />
                  </div>
                </>
              ) : (
                <p className="text-xs text-ink-muted">Memuat status kuota AI...</p>
              )}

              <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">
                Berlaku untuk terjemahan jurnal, tanya jawab PDF, intisari AI,
                analisis hasil, dan matriks literatur. Kuota direset otomatis setiap
                hari (00:00 UTC).
              </p>

              {!user && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenAuth();
                  }}
                  className="btn-tactile mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-2 text-xs font-semibold text-white hover:bg-accent-hover"
                >
                  <Cloud className="h-3.5 w-3.5" />
                  Daftar Gratis untuk Naikkan Kuota ke 100×/Hari
                </button>
              )}
            </section>

            {/* Theme Mode */}
            <section className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-heading">
                <Sun className="h-3.5 w-3.5 text-accent-soft" />
                Tema Tampilan
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: "dark", label: "Gelap", Icon: Moon },
                    { id: "light", label: "Terang", Icon: Sun },
                    { id: "system", label: "Sistem", Icon: Monitor },
                  ] as Array<{
                    id: ThemePreference;
                    label: string;
                    Icon: typeof Moon;
                  }>
                ).map(({ id, label, Icon }) => {
                  const active = appearance.theme === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => handleAppearanceChange({ theme: id })}
                      className={`btn-tactile flex min-h-[42px] items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
                        active
                          ? "border-accent bg-accent/15 font-semibold text-accent-soft"
                          : "border-line-strong bg-canvas text-ink-secondary hover:border-line-hover hover:text-heading"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Accent Color Palette */}
            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-heading">
                  <Palette className="h-3.5 w-3.5 text-accent-soft" />
                  Palet Warna Aksen
                </span>
                <span className="text-[11px] text-ink-muted">
                  Berubah seketika
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {PALETTE_OPTIONS.map((pal) => {
                  const active = appearance.palette === pal.id;
                  return (
                    <button
                      key={pal.id}
                      type="button"
                      onClick={() => handleAppearanceChange({ palette: pal.id })}
                      className={`btn-tactile flex items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors ${
                        active
                          ? "border-accent bg-accent/12 text-heading"
                          : "border-line-strong bg-canvas text-ink-body hover:border-line-hover hover:text-heading"
                      }`}
                    >
                      <span
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/25 shadow-sm"
                        style={{ backgroundColor: pal.swatch }}
                      >
                        {active && <Check className="h-3 w-3 text-white" />}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-heading">
                          {pal.label}
                        </p>
                        <p className="truncate text-[10px] text-ink-muted">
                          {pal.desc}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Default Search Preferences */}
            <section className="space-y-2.5 rounded-xl border border-line bg-canvas p-4">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-heading">
                <SlidersHorizontal className="h-3.5 w-3.5 text-accent-soft" />
                Preferensi Pencarian Default
              </div>
              <div className="grid gap-2.5 sm:grid-cols-3">
                <label className="block">
                  <span className="mb-1 block text-[11px] text-ink-secondary">
                    Urutan Hasil
                  </span>
                  <select
                    value={localSearchPrefs.defaultSort}
                    onChange={(e) =>
                      handleSearchPrefPatch({
                        defaultSort: e.target.value as SortOption,
                      })
                    }
                    className="min-h-[38px] w-full rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-xs text-ink focus:border-accent-soft"
                  >
                    <option value="relevance">Relevansi</option>
                    <option value="impact">Impact Factor</option>
                    <option value="newest">Terbaru</option>
                    <option value="citations">Sitasi</option>
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-[11px] text-ink-secondary">
                    Cakupan Akses
                  </span>
                  <select
                    value={localSearchPrefs.defaultPdfOnly ? "pdf" : "all"}
                    onChange={(e) =>
                      handleSearchPrefPatch({
                        defaultPdfOnly: e.target.value === "pdf",
                      })
                    }
                    className="min-h-[38px] w-full rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-xs text-ink focus:border-accent-soft"
                  >
                    <option value="all">Semua Referensi</option>
                    <option value="pdf">Akses PDF Penuh</option>
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-[11px] text-ink-secondary">
                    Filter Peringkat
                  </span>
                  <select
                    value={localSearchPrefs.defaultTierPreset}
                    onChange={(e) =>
                      handleSearchPrefPatch({
                        defaultTierPreset: e.target.value as DefaultTierPreset,
                      })
                    }
                    className="min-h-[38px] w-full rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-xs text-ink focus:border-accent-soft"
                  >
                    <option value="all">Semua Tier</option>
                    <option value="q1">Khusus Q1</option>
                    <option value="q1_q2">Q1–Q2</option>
                    <option value="q1_q4">Q1–Q4</option>
                    <option value="sinta">SINTA 1–6</option>
                  </select>
                </label>
              </div>
            </section>
          </div>
        )}

        {tab === "account" &&
          (user ? (
            <div className="space-y-5">
              <form
                onSubmit={(e) => void handleUpdateName(e)}
                className="space-y-3"
              >
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-ink-body">
                    Email Akun
                  </span>
                  <input
                    type="email"
                    disabled
                    value={user.email}
                    className="w-full rounded-xl border border-line bg-canvas/70 px-3 py-2 text-sm text-ink-muted"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-ink-body">
                    Nama Lengkap
                  </span>
                  <div className="flex items-center gap-2.5 rounded-xl border border-line-strong bg-canvas px-3 py-2 focus-within:border-accent-soft">
                    <User className="h-4 w-4 shrink-0 text-ink-muted" />
                    <input
                      type="text"
                      required
                      minLength={2}
                      maxLength={80}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full bg-transparent text-sm text-heading placeholder:text-ink-muted focus:outline-none"
                    />
                  </div>
                </label>

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-tactile flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-2.5 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  <Check className="h-4 w-4" />
                  Simpan Nama Profil
                </button>
              </form>

              <div className="border-t border-line pt-4">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-secondary">
                  Ubah Kata Sandi
                </h3>
                <form
                  onSubmit={(e) => void handleChangePassword(e)}
                  className="space-y-3"
                >
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-ink-body">
                      Kata Sandi Saat Ini
                    </span>
                    <div className="flex items-center gap-2.5 rounded-xl border border-line-strong bg-canvas px-3 py-2 focus-within:border-accent-soft">
                      <Lock className="h-4 w-4 shrink-0 text-ink-muted" />
                      <input
                        type={showPwd ? "text" : "password"}
                        required
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="Kata sandi lama"
                        className="w-full bg-transparent text-sm text-heading placeholder:text-ink-muted focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPwd((v) => !v)}
                        aria-label={
                          showPwd ? "Sembunyikan sandi" : "Tampilkan sandi"
                        }
                        className="text-ink-muted hover:text-heading"
                      >
                        {showPwd ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-ink-body">
                      Kata Sandi Baru
                    </span>
                    <div className="flex items-center gap-2.5 rounded-xl border border-line-strong bg-canvas px-3 py-2 focus-within:border-accent-soft">
                      <Shield className="h-4 w-4 shrink-0 text-ink-muted" />
                      <input
                        type={showPwd ? "text" : "password"}
                        required
                        minLength={8}
                        maxLength={72}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Min. 8 karakter (huruf & angka)"
                        className="w-full bg-transparent text-sm text-heading placeholder:text-ink-muted focus:outline-none"
                      />
                    </div>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-ink-body">
                      Ulangi Kata Sandi Baru
                    </span>
                    <div className="flex items-center gap-2.5 rounded-xl border border-line-strong bg-canvas px-3 py-2 focus-within:border-accent-soft">
                      <Lock className="h-4 w-4 shrink-0 text-ink-muted" />
                      <input
                        type={showPwd ? "text" : "password"}
                        required
                        minLength={8}
                        maxLength={72}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Konfirmasi kata sandi baru"
                        className="w-full bg-transparent text-sm text-heading placeholder:text-ink-muted focus:outline-none"
                      />
                    </div>
                  </label>

                  <button
                    type="submit"
                    disabled={loading}
                    className="btn-tactile flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-2.5 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
                  >
                    {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                    Perbarui Kata Sandi
                  </button>
                </form>
              </div>

              <div className="grid gap-2 border-t border-line pt-4 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={loggingOut}
                  onClick={() => void handleLogoutCurrent()}
                  className="btn-tactile flex min-h-[40px] items-center justify-center gap-2 rounded-xl border border-line-strong bg-canvas px-3 py-2 text-xs font-medium text-ink-strong hover:border-danger/45 hover:text-danger disabled:opacity-60"
                >
                  {loggingOut ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <LogOut className="h-3.5 w-3.5" />
                  )}
                  Keluar Perangkat Ini
                </button>
                <button
                  type="button"
                  disabled={loggingOutAll}
                  onClick={() => void handleLogoutAll()}
                  className="btn-tactile flex min-h-[40px] items-center justify-center gap-2 rounded-xl border border-line-strong bg-canvas px-3 py-2 text-xs font-medium text-ink-strong hover:border-accent-soft/45 hover:text-heading disabled:opacity-60"
                >
                  {loggingOutAll ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Shield className="h-3.5 w-3.5 text-accent-soft" />
                  )}
                  Keluar Semua Perangkat
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 rounded-xl border border-line bg-canvas p-5 text-center">
              <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/15 text-accent-soft">
                <Cloud className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-heading">
                  Masuk untuk Kelola Profil &amp; Kata Sandi
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-secondary">
                  Dengan akun gratis SmartSari by AirEvo, Anda dapat mengubah kata
                  sandi, mencabut sesi perangkat lain, menyinkronkan proyek riset,
                  serta memperoleh kuota AI{" "}
                  <strong className="text-heading">100×/hari</strong>.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenAuth();
                }}
                className="btn-tactile inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover"
              >
                <Cloud className="h-4 w-4" />
                Masuk atau Daftar Akun Gratis
              </button>
            </div>
          ))}

        {tab === "privacy" && (
          <div className="space-y-5">
            <section className="rounded-xl border border-line bg-canvas p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold text-heading">
                    <Database className="h-3.5 w-3.5 text-accent-soft" />
                    Cache Riset di Browser
                  </h3>
                  <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">
                    Menghapus cache pencarian, terjemahan, dan PDF lokal tanpa
                    mengubah tema maupun palet warna Anda.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClearLocalCache();
                  setError(null);
                  setSuccess(
                    "Cache riset lokal dibersihkan. Pencarian berikutnya mengambil data terbaru."
                  );
                }}
                className="btn-tactile mt-3 inline-flex min-h-[38px] w-full items-center justify-center gap-2 rounded-xl border border-line-strong bg-surface px-3 py-2 text-xs font-medium text-ink-strong hover:border-accent-soft/45 hover:text-heading"
              >
                <Trash2 className="h-3.5 w-3.5 text-accent-soft" />
                Bersihkan Cache Lokal
              </button>
            </section>

            <section className="space-y-2 rounded-xl border border-line bg-canvas p-4">
              <h3 className="text-xs font-semibold text-heading">
                Bantuan, Kontak &amp; Dokumen Legal
              </h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenShortcuts();
                  }}
                  className="btn-tactile flex min-h-[38px] items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 py-2 font-medium text-ink-body hover:border-accent-soft/45 hover:text-heading"
                >
                  <HelpCircle className="h-3.5 w-3.5 shrink-0 text-accent-soft" />
                  <span>Pintasan &amp; Tips</span>
                </button>
                <Link
                  href="/kontak"
                  onClick={onClose}
                  className="btn-tactile flex min-h-[38px] items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 py-2 font-medium text-ink-body hover:border-accent-soft/45 hover:text-heading"
                >
                  <Mail className="h-3.5 w-3.5 shrink-0 text-accent-soft" />
                  <span>Kontak &amp; Bantuan</span>
                </Link>
                <Link
                  href="/ketentuan"
                  onClick={onClose}
                  className="btn-tactile flex min-h-[38px] items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 py-2 font-medium text-ink-body hover:border-accent-soft/45 hover:text-heading"
                >
                  <FileCheck2 className="h-3.5 w-3.5 shrink-0 text-accent-soft" />
                  <span>Ketentuan</span>
                </Link>
                <Link
                  href="/privasi"
                  onClick={onClose}
                  className="btn-tactile flex min-h-[38px] items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 py-2 font-medium text-ink-body hover:border-accent-soft/45 hover:text-heading"
                >
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-accent-soft" />
                  <span>Kebijakan Privasi</span>
                </Link>
                <Link
                  href="/lisensi"
                  onClick={onClose}
                  className="btn-tactile col-span-2 flex min-h-[38px] items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 py-2 font-medium text-ink-body hover:border-accent-soft/45 hover:text-heading"
                >
                  <Scale className="h-3.5 w-3.5 shrink-0 text-accent-soft" />
                  <span>Lisensi, Hak Cipta &amp; Atribusi</span>
                </Link>
              </div>
            </section>

            {user && (
              <form
                onSubmit={(e) => void handleDeleteAccount(e)}
                className="space-y-3 rounded-xl border border-danger/30 bg-danger/5 p-4"
              >
                <div className="flex items-start gap-2.5 text-xs leading-relaxed text-danger-soft">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
                  <span>
                    <strong className="font-semibold">
                      Hapus Akun Permanen (UU PDP):
                    </strong>{" "}
                    Akun, proyek riset, bookmark, riwayat pencarian, dan arsip
                    konversi Anda akan langsung dihapus dari server.
                  </span>
                </div>

                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-ink-body">
                    Kata Sandi Akun
                  </span>
                  <input
                    type="password"
                    required
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    placeholder="Masukkan kata sandi Anda"
                    className="w-full rounded-xl border border-line-strong bg-canvas px-3 py-2 text-sm text-heading placeholder:text-ink-muted focus:border-danger focus:outline-none"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-ink-body">
                    Ketik <span className="font-mono text-danger">HAPUS</span>{" "}
                    untuk Konfirmasi
                  </span>
                  <input
                    type="text"
                    required
                    value={deleteConfirm}
                    onChange={(e) => setDeleteConfirm(e.target.value)}
                    placeholder="HAPUS"
                    className="w-full rounded-xl border border-line-strong bg-canvas px-3 py-2 font-mono text-sm text-heading placeholder:text-ink-muted focus:border-danger focus:outline-none"
                  />
                </label>

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-tactile flex w-full items-center justify-center gap-2 rounded-xl bg-[#DC2626] py-2.5 text-sm font-semibold text-white hover:bg-[#B91C1C] disabled:opacity-60"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Hapus Akun Permanen
                </button>
              </form>
            )}

            <p className="text-center text-[11px] text-ink-muted">
              SmartSari by AirEvo · Platform Riset Ilmiah Indonesia
            </p>
          </div>
        )}

        {success && (
          <p className="mt-4 rounded-xl border border-ok/35 bg-ok/10 px-3 py-2 text-xs text-ok-soft">
            {success}
          </p>
        )}

        {error && (
          <p className="mt-4 rounded-xl border border-danger/35 bg-danger/10 px-3 py-2 text-xs text-danger-soft">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
