"use client";

import { useState } from "react";
import { Cloud, Loader2, Lock, Mail, User, X } from "lucide-react";
import type { AuthUser } from "@/lib/types";

interface AuthModalProps {
  onClose: () => void;
  onSuccess: (user: AuthUser) => void;
}

export function AuthModal({ onClose, onSuccess }: AuthModalProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const endpoint =
        mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const payload =
        mode === "login" ? { email, password } : { name, email, password };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { user?: AuthUser; error?: string };
      if (!res.ok || !data.user) {
        setError(data.error || "Autentikasi gagal. Periksa data Anda.");
        return;
      }
      onSuccess(data.user);
    } catch {
      setError("Gagal menghubungi server autentikasi.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Akun SmartSari"
    >
      <div className="animate-modal-in w-full max-w-md rounded-2xl border border-[#2C2E35] bg-[#151619] p-6 text-[#F4F4F5] shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#DB2777]/15 text-[#F472B6]">
              <Cloud className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-white">
                Sinkronkan Ruang Riset
              </h2>
              <p className="text-xs text-[#A1A1AA]">
                Simpan proyek, catatan &amp; riwayat di semua perangkat.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup dialog akun"
            className="rounded-lg p-1.5 text-[#A1A1AA] hover:bg-[#1E1F23] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-4 grid grid-cols-2 rounded-xl border border-[#232429] bg-[#0E0F12] p-1">
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setError(null);
            }}
            className={`rounded-lg py-1.5 text-xs font-semibold transition-colors ${
              mode === "login"
                ? "bg-[#DB2777] text-white"
                : "text-[#A1A1AA] hover:text-white"
            }`}
          >
            Masuk
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("register");
              setError(null);
            }}
            className={`rounded-lg py-1.5 text-xs font-semibold transition-colors ${
              mode === "register"
                ? "bg-[#DB2777] text-white"
                : "text-[#A1A1AA] hover:text-white"
            }`}
          >
            Daftar Akun Baru
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
          {mode === "register" && (
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
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nama peneliti / mahasiswa"
                  className="w-full bg-transparent text-sm text-white placeholder-[#71717A] focus:outline-none"
                />
              </div>
            </label>
          )}

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[#D4D4D8]">
              Email
            </span>
            <div className="flex items-center gap-2 rounded-xl border border-[#2C2E35] bg-[#0E0F12] px-3 py-2 focus-within:border-[#F472B6]">
              <Mail className="h-4 w-4 text-[#71717A]" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@kampus.ac.id"
                className="w-full bg-transparent text-sm text-white placeholder-[#71717A] focus:outline-none"
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[#D4D4D8]">
              Kata Sandi
            </span>
            <div className="flex items-center gap-2 rounded-xl border border-[#2C2E35] bg-[#0E0F12] px-3 py-2 focus-within:border-[#F472B6]">
              <Lock className="h-4 w-4 text-[#71717A]" />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimal 6 karakter"
                className="w-full bg-transparent text-sm text-white placeholder-[#71717A] focus:outline-none"
              />
            </div>
          </label>

          {error && (
            <p className="rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/10 px-3 py-2 text-xs text-[#FCA5A5]">
              {error}
            </p>
          )}

          <p className="text-[11px] leading-relaxed text-[#71717A]">
            Jurnal tersimpan, proyek riset, dan riwayat di perangkat ini akan
            otomatis digabungkan ke akun Anda.
          </p>

          <button
            type="submit"
            disabled={loading}
            className="btn-tactile flex w-full items-center justify-center gap-2 rounded-xl bg-[#DB2777] py-2.5 text-sm font-semibold text-white hover:bg-[#BE185D] disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "login" ? "Masuk & Sinkronkan" : "Buat Akun & Sinkronkan"}
          </button>
        </form>
      </div>
    </div>
  );
}
