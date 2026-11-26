"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Check,
  Cloud,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  RefreshCw,
  ShieldCheck,
  User,
  X,
} from "lucide-react";
import type { AuthUser } from "@/lib/types";

interface AuthModalProps {
  onClose: () => void;
  onSuccess: (user: AuthUser) => void;
}

export function AuthModal({ onClose, onSuccess }: AuthModalProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [registerStep, setRegisterStep] = useState<"form" | "otp">("form");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [website, setWebsite] = useState("");

  const [challengeQuestion, setChallengeQuestion] = useState("");
  const [challengeToken, setChallengeToken] = useState("");
  const [challengeAnswer, setChallengeAnswer] = useState("");
  const [loadingChallenge, setLoadingChallenge] = useState(false);

  const [otpCode, setOtpCode] = useState("");
  const [otpCooldown, setOtpCooldown] = useState(0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchChallenge = useCallback(async () => {
    setLoadingChallenge(true);
    try {
      const res = await fetch("/api/auth/challenge", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { question?: string; token?: string };
      if (data.question && data.token) {
        setChallengeQuestion(data.question);
        setChallengeToken(data.token);
        setChallengeAnswer("");
      }
    } catch {
      // Ignored
    } finally {
      setLoadingChallenge(false);
    }
  }, []);

  useEffect(() => {
    if (mode === "register" && registerStep === "form") {
      void fetchChallenge();
    }
  }, [mode, registerStep, fetchChallenge]);

  useEffect(() => {
    if (otpCooldown <= 0) return;
    const timer = setInterval(() => {
      setOtpCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [otpCooldown]);

  const hasMinLen = password.length >= 8 && password.length <= 72;
  const hasLetterAndDigit =
    /[A-Za-z]/.test(password) && /[0-9]/.test(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === "login") {
      setLoading(true);
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const data = (await res.json()) as { user?: AuthUser; error?: string };
        if (!res.ok || !data.user) {
          setError(data.error || "Email atau kata sandi salah.");
          return;
        }
        onSuccess(data.user);
      } catch {
        setError("Gagal menghubungi server autentikasi.");
      } finally {
        setLoading(false);
      }
      return;
    }

    if (registerStep === "form") {
      if (!hasMinLen || !hasLetterAndDigit) {
        setError(
          "Kata sandi wajib 8–72 karakter dengan kombinasi huruf dan angka."
        );
        return;
      }
      if (password !== confirmPassword) {
        setError("Konfirmasi kata sandi tidak cocok.");
        return;
      }
      if (!challengeToken || !challengeAnswer.trim()) {
        setError("Lengkapi jawaban verifikasi keamanan terlebih dahulu.");
        return;
      }

      setLoading(true);
      try {
        const res = await fetch("/api/auth/register/request-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            email,
            password,
            website,
            challengeToken,
            challengeAnswer: challengeAnswer.trim(),
          }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          cooldownSeconds?: number;
          error?: string;
        };
        if (!res.ok || !data.ok) {
          setError(data.error || "Gagal mengirim kode OTP email.");
          void fetchChallenge();
          return;
        }
        setOtpCode("");
        setOtpCooldown(data.cooldownSeconds ?? 60);
        setRegisterStep("otp");
      } catch {
        setError("Gagal menghubungi server OTP.");
      } finally {
        setLoading(false);
      }
      return;
    }

    // registerStep === "otp"
    if (!/^\d{6}$/.test(otpCode.trim())) {
      setError("Masukkan 6 digit angka kode OTP dari email Anda.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/register/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          otp: otpCode.trim(),
        }),
      });
      const data = (await res.json()) as { user?: AuthUser; error?: string };
      if (!res.ok || !data.user) {
        setError(data.error || "Kode OTP tidak cocok.");
        return;
      }
      onSuccess(data.user);
    } catch {
      setError("Gagal memverifikasi kode OTP.");
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
      <div className="animate-modal-in max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl border border-[#2C2E35] bg-[#151619] p-6 text-[#F4F4F5] shadow-2xl">
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
              setRegisterStep("form");
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
              setRegisterStep("form");
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
          {/* Off-screen honeypot trap for automated spam bots */}
          <div className="sr-only" aria-hidden="true">
            <label htmlFor="smartsari-website">Website</label>
            <input
              id="smartsari-website"
              name="website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </div>

          {mode === "register" && registerStep === "otp" ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-[#DB2777]/35 bg-[#DB2777]/10 p-3.5 text-xs leading-relaxed text-[#FBCFE8]">
                Kode OTP 6 digit telah dikirim ke{" "}
                <strong className="text-white">{email}</strong>. Periksa Inbox
                atau folder Spam Anda (berlaku 10 menit).
              </div>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[#D4D4D8]">
                  Kode OTP Email (6 Digit)
                </span>
                <div className="flex items-center gap-2 rounded-xl border border-[#2C2E35] bg-[#0E0F12] px-3 py-2.5 focus-within:border-[#F472B6]">
                  <KeyRound className="h-4 w-4 text-[#F472B6]" />
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    required
                    value={otpCode}
                    onChange={(e) =>
                      setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    placeholder="000000"
                    className="w-full bg-transparent text-center font-mono text-lg font-bold tracking-[0.45em] text-white placeholder-[#52525B] focus:outline-none"
                  />
                </div>
              </label>

              <button
                type="button"
                disabled={otpCooldown > 0}
                onClick={() => {
                  setRegisterStep("form");
                  setError(null);
                }}
                className="inline-flex items-center gap-1.5 text-xs text-[#A1A1AA] hover:text-white disabled:opacity-50"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                {otpCooldown > 0
                  ? `Ubah email / minta kode baru (${otpCooldown}d)`
                  : "Ubah email / minta kode baru"}
              </button>
            </div>
          ) : (
            <>
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
                      maxLength={80}
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
                    maxLength={160}
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
                    minLength={mode === "register" ? 8 : 1}
                    maxLength={72}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={
                      mode === "register"
                        ? "Min. 8 karakter (huruf & angka)"
                        : "Masukkan kata sandi"
                    }
                    className="w-full bg-transparent text-sm text-white placeholder-[#71717A] focus:outline-none"
                  />
                </div>
              </label>

              {mode === "register" && (
                <>
                  <div className="flex flex-wrap gap-3 text-[11px]">
                    <span
                      className={`inline-flex items-center gap-1 ${
                        hasMinLen ? "text-[#4ADE80]" : "text-[#71717A]"
                      }`}
                    >
                      <Check className="h-3 w-3" />
                      8–72 karakter
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 ${
                        hasLetterAndDigit ? "text-[#4ADE80]" : "text-[#71717A]"
                      }`}
                    >
                      <Check className="h-3 w-3" />
                      Kombinasi huruf &amp; angka
                    </span>
                  </div>

                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-[#D4D4D8]">
                      Konfirmasi Kata Sandi
                    </span>
                    <div className="flex items-center gap-2 rounded-xl border border-[#2C2E35] bg-[#0E0F12] px-3 py-2 focus-within:border-[#F472B6]">
                      <Lock className="h-4 w-4 text-[#71717A]" />
                      <input
                        type="password"
                        required
                        minLength={8}
                        maxLength={72}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Ulangi kata sandi"
                        className="w-full bg-transparent text-sm text-white placeholder-[#71717A] focus:outline-none"
                      />
                    </div>
                  </label>

                  {/* Signed Single-Use Anti-Bot Challenge */}
                  <div className="rounded-xl border border-[#2C2E35] bg-[#0E0F12] p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#F9A8D4]">
                        <ShieldCheck className="h-3.5 w-3.5 text-[#F472B6]" />
                        Verifikasi Anti-Bot
                      </span>
                      <button
                        type="button"
                        onClick={() => void fetchChallenge()}
                        disabled={loadingChallenge}
                        aria-label="Muat ulang soal verifikasi"
                        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-[#A1A1AA] hover:bg-[#1E1F23] hover:text-white disabled:opacity-50"
                      >
                        <RefreshCw
                          className={`h-3 w-3 ${
                            loadingChallenge ? "animate-spin" : ""
                          }`}
                        />
                        Ganti soal
                      </button>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <span className="shrink-0 rounded-lg border border-[#232429] bg-[#151619] px-3 py-1.5 font-mono text-xs font-semibold text-white">
                        {challengeQuestion || "Memuat..."}
                      </span>
                      <input
                        type="text"
                        inputMode="numeric"
                        required
                        value={challengeAnswer}
                        onChange={(e) => setChallengeAnswer(e.target.value)}
                        placeholder="Jawaban angka"
                        className="min-w-0 flex-1 rounded-lg border border-[#2C2E35] bg-[#151619] px-3 py-1.5 text-sm text-white placeholder-[#71717A] focus:border-[#F472B6] focus:outline-none"
                      />
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {error && (
            <p className="rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/10 px-3 py-2 text-xs text-[#FCA5A5]">
              {error}
            </p>
          )}

          <p className="text-[11px] leading-relaxed text-[#71717A]">
            {mode === "register"
              ? "Dilindungi OTP email, anti-bot, rate-limit berlapis, blokir email sementara & enkripsi scrypt."
              : "Jurnal tersimpan, proyek riset, dan riwayat di perangkat ini akan otomatis digabungkan ke akun Anda."}
          </p>

          <button
            type="submit"
            disabled={loading}
            className="btn-tactile flex w-full items-center justify-center gap-2 rounded-xl bg-[#DB2777] py-2.5 text-sm font-semibold text-white hover:bg-[#BE185D] disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "login"
              ? "Masuk & Sinkronkan"
              : registerStep === "form"
                ? "Kirim Kode OTP ke Email"
                : "Verifikasi & Buat Akun"}
          </button>
        </form>
      </div>
    </div>
  );
}
