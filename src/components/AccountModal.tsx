"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Check,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  LogOut,
  Shield,
  Trash2,
  User,
  X,
} from "lucide-react";
import type { AuthUser } from "@/lib/types";

interface AccountModalProps {
  user: AuthUser;
  onClose: () => void;
  onProfileUpdated: (user: AuthUser) => void;
  onLoggedOutAll: () => void;
  onAccountDeleted: () => void;
}

export function AccountModal({
  user,
  onClose,
  onProfileUpdated,
  onLoggedOutAll,
  onAccountDeleted,
}: AccountModalProps) {
  const [tab, setTab] = useState<"profile" | "security" | "delete">("profile");

  const [name, setName] = useState(user.name);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);

  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");

  const [loading, setLoading] = useState(false);
  const [loggingOutAll, setLoggingOutAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Pengaturan Akun SmartSari"
    >
      <div className="animate-modal-in max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl border border-[#2C2E35] bg-[#151619] p-6 text-[#F4F4F5] shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#DB2777]/15 text-[#F472B6]">
              <User className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-white">
                Pengaturan Akun
              </h2>
              <p className="truncate text-xs text-[#A1A1AA]">{user.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup pengaturan akun"
            className="rounded-lg p-1.5 text-[#A1A1AA] hover:bg-[#1E1F23] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-4 grid grid-cols-3 rounded-xl border border-[#232429] bg-[#0E0F12] p-1">
          {(
            [
              { id: "profile", label: "Profil" },
              { id: "security", label: "Keamanan" },
              { id: "delete", label: "Hapus Akun" },
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
              className={`rounded-lg py-1.5 text-xs font-semibold transition-colors ${
                tab === item.id
                  ? item.id === "delete"
                    ? "bg-[#DC2626] text-white"
                    : "bg-[#DB2777] text-white"
                  : "text-[#A1A1AA] hover:text-white"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === "profile" && (
          <form onSubmit={(e) => void handleUpdateName(e)} className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[#D4D4D8]">
                Email Akun
              </span>
              <input
                type="email"
                disabled
                value={user.email}
                className="w-full rounded-xl border border-[#232429] bg-[#0E0F12]/70 px-3 py-2 text-sm text-[#71717A]"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[#D4D4D8]">
                Nama Lengkap
              </span>
              <div className="flex items-center gap-2 rounded-xl border border-[#2C2E35] bg-[#0E0F12] px-3 py-2 focus-within:border-[#F472B6]">
                <User className="h-4 w-4 text-[#71717A]" />
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-transparent text-sm text-white placeholder-[#71717A] focus:outline-none"
                />
              </div>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="btn-tactile flex w-full items-center justify-center gap-2 rounded-xl bg-[#DB2777] py-2.5 text-sm font-semibold text-white hover:bg-[#BE185D] disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              <Check className="h-4 w-4" />
              Simpan Profil
            </button>
          </form>
        )}

        {tab === "security" && (
          <div className="space-y-4">
            <form
              onSubmit={(e) => void handleChangePassword(e)}
              className="space-y-3"
            >
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[#D4D4D8]">
                  Kata Sandi Saat Ini
                </span>
                <div className="flex items-center gap-2 rounded-xl border border-[#2C2E35] bg-[#0E0F12] px-3 py-2 focus-within:border-[#F472B6]">
                  <Lock className="h-4 w-4 text-[#71717A]" />
                  <input
                    type={showPwd ? "text" : "password"}
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Kata sandi lama"
                    className="w-full bg-transparent text-sm text-white placeholder-[#71717A] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((v) => !v)}
                    aria-label={showPwd ? "Sembunyikan sandi" : "Tampilkan sandi"}
                    className="text-[#71717A] hover:text-white"
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
                <span className="mb-1 block text-xs font-medium text-[#D4D4D8]">
                  Kata Sandi Baru
                </span>
                <div className="flex items-center gap-2 rounded-xl border border-[#2C2E35] bg-[#0E0F12] px-3 py-2 focus-within:border-[#F472B6]">
                  <Shield className="h-4 w-4 text-[#71717A]" />
                  <input
                    type={showPwd ? "text" : "password"}
                    required
                    minLength={8}
                    maxLength={72}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min. 8 karakter (huruf & angka)"
                    className="w-full bg-transparent text-sm text-white placeholder-[#71717A] focus:outline-none"
                  />
                </div>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[#D4D4D8]">
                  Ulangi Kata Sandi Baru
                </span>
                <div className="flex items-center gap-2 rounded-xl border border-[#2C2E35] bg-[#0E0F12] px-3 py-2 focus-within:border-[#F472B6]">
                  <Lock className="h-4 w-4 text-[#71717A]" />
                  <input
                    type={showPwd ? "text" : "password"}
                    required
                    minLength={8}
                    maxLength={72}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Konfirmasi kata sandi baru"
                    className="w-full bg-transparent text-sm text-white placeholder-[#71717A] focus:outline-none"
                  />
                </div>
              </label>

              <button
                type="submit"
                disabled={loading}
                className="btn-tactile flex w-full items-center justify-center gap-2 rounded-xl bg-[#DB2777] py-2.5 text-sm font-semibold text-white hover:bg-[#BE185D] disabled:opacity-60"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Perbarui Kata Sandi
              </button>
            </form>

            <div className="border-t border-[#232429] pt-3">
              <button
                type="button"
                disabled={loggingOutAll}
                onClick={() => void handleLogoutAll()}
                className="btn-tactile flex w-full items-center justify-center gap-2 rounded-xl border border-[#2C2E35] bg-[#0E0F12] py-2 text-xs font-medium text-[#E4E4E7] hover:border-[#F472B6]/45 hover:text-white disabled:opacity-60"
              >
                {loggingOutAll ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <LogOut className="h-3.5 w-3.5 text-[#F472B6]" />
                )}
                Keluar dari Semua Perangkat
              </button>
            </div>
          </div>
        )}

        {tab === "delete" && (
          <form
            onSubmit={(e) => void handleDeleteAccount(e)}
            className="space-y-3"
          >
            <div className="flex items-start gap-2.5 rounded-xl border border-[#EF4444]/35 bg-[#EF4444]/10 p-3 text-xs leading-relaxed text-[#FCA5A5]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#F87171]" />
              <span>
                Tindakan ini permanen (sesuai hak hapus data UU PDP). Akun,
                proyek riset, bookmark, riwayat pencarian, dan arsip konversi
                Anda akan langsung dihapus dari server.
              </span>
            </div>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[#D4D4D8]">
                Kata Sandi Akun
              </span>
              <input
                type="password"
                required
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder="Masukkan kata sandi Anda"
                className="w-full rounded-xl border border-[#2C2E35] bg-[#0E0F12] px-3 py-2 text-sm text-white placeholder-[#71717A] focus:border-[#F87171] focus:outline-none"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[#D4D4D8]">
                Ketik <span className="font-mono text-[#FCA5A5]">HAPUS</span>{" "}
                untuk Konfirmasi
              </span>
              <input
                type="text"
                required
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder="HAPUS"
                className="w-full rounded-xl border border-[#2C2E35] bg-[#0E0F12] px-3 py-2 font-mono text-sm text-white placeholder-[#71717A] focus:border-[#F87171] focus:outline-none"
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

        {success && (
          <p className="mt-3 rounded-lg border border-[#4ADE80]/30 bg-[#4ADE80]/10 px-3 py-2 text-xs text-[#86EFAC]">
            {success}
          </p>
        )}

        {error && (
          <p className="mt-3 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/10 px-3 py-2 text-xs text-[#FCA5A5]">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
