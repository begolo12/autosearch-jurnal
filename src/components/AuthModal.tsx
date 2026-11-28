"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  Cloud,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  RefreshCw,
  ShieldCheck,
  User,
  X,
} from "lucide-react";
import { getActiveResolvedTheme } from "@/lib/appearance";
import { useBodyScrollLock } from "@/lib/use-scroll-lock";
import type { AuthUser } from "@/lib/types";

interface AuthModalProps {
  onClose: () => void;
  onSuccess: (user: AuthUser) => void;
}

interface TurnstileApi {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      theme?: "dark" | "light" | "auto";
      callback?: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
    }
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export function AuthModal({ onClose, onSuccess }: AuthModalProps) {
  const [mode, setMode] = useState<"login" | "register" | "forgot">("login");
  const [registerStep, setRegisterStep] = useState<"form" | "otp">("form");
  const [forgotStep, setForgotStep] = useState<"email" | "reset">("email");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [website, setWebsite] = useState("");

  const [challengeMode, setChallengeMode] = useState<"math" | "turnstile">("math");
  const [turnstileSiteKey, setTurnstileSiteKey] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState("");
  const turnstileContainerRef = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);

  const [challengeQuestion, setChallengeQuestion] = useState("");
  const [challengeToken, setChallengeToken] = useState("");
  const [challengeAnswer, setChallengeAnswer] = useState("");
  const [loadingChallenge, setLoadingChallenge] = useState(false);

  const [otpCode, setOtpCode] = useState("");
  const [otpCooldown, setOtpCooldown] = useState(0);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handlePasswordKeyEvent = (e: React.KeyboardEvent<HTMLInputElement>) => {
    setCapsLockOn(Boolean(e.getModifierState?.("CapsLock")));
  };

  const resetTurnstileWidget = useCallback(() => {
    setTurnstileToken("");
    if (turnstileWidgetIdRef.current && window.turnstile) {
      try {
        window.turnstile.reset(turnstileWidgetIdRef.current);
      } catch {
        // Ignore widget reset errors
      }
    }
  }, []);

  const fetchChallenge = useCallback(async () => {
    setLoadingChallenge(true);
    try {
      const res = await fetch("/api/auth/challenge", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        mode?: "math" | "turnstile";
        siteKey?: string;
        question?: string;
        token?: string;
      };
      if (data.mode === "turnstile" && data.siteKey) {
        setChallengeMode("turnstile");
        setTurnstileSiteKey(data.siteKey);
        resetTurnstileWidget();
      } else if (data.question && data.token) {
        setChallengeMode("math");
        setChallengeQuestion(data.question);
        setChallengeToken(data.token);
        setChallengeAnswer("");
      }
    } catch {
      // Ignored
    } finally {
      setLoadingChallenge(false);
    }
  }, [resetTurnstileWidget]);

  useEffect(() => {
    const needsChallenge =
      (mode === "register" && registerStep === "form") ||
      (mode === "forgot" && forgotStep === "email");
    const id = queueMicrotask(() => {
      setShowPassword(false);
      setShowConfirmPassword(false);
      if (needsChallenge) {
        void fetchChallenge();
      }
    });
    void id;
  }, [mode, registerStep, forgotStep, fetchChallenge]);

  useEffect(() => {
    const needsChallenge =
      (mode === "register" && registerStep === "form") ||
      (mode === "forgot" && forgotStep === "email");

    if (!needsChallenge || challengeMode !== "turnstile" || !turnstileSiteKey) {
      return;
    }

    let cancelled = false;
    const renderWidget = () => {
      if (cancelled || !turnstileContainerRef.current || !window.turnstile) {
        return;
      }
      if (turnstileWidgetIdRef.current) {
        try {
          window.turnstile.remove(turnstileWidgetIdRef.current);
        } catch {
          // Ignore remove error
        }
        turnstileWidgetIdRef.current = null;
      }
      turnstileWidgetIdRef.current = window.turnstile.render(
        turnstileContainerRef.current,
        {
          sitekey: turnstileSiteKey,
          theme: getActiveResolvedTheme(),
          callback: (token) => setTurnstileToken(token),
          "expired-callback": () => setTurnstileToken(""),
          "error-callback": () => setTurnstileToken(""),
        }
      );
    };

    if (window.turnstile) {
      renderWidget();
    } else {
      const existingScript = document.querySelector<HTMLScriptElement>(
        'script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]'
      );
      if (existingScript) {
        existingScript.addEventListener("load", renderWidget, { once: true });
      } else {
        const script = document.createElement("script");
        script.src =
          "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.defer = true;
        script.addEventListener("load", renderWidget, { once: true });
        document.head.appendChild(script);
      }
    }

    return () => {
      cancelled = true;
      if (turnstileWidgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(turnstileWidgetIdRef.current);
        } catch {
          // Ignore remove error
        }
        turnstileWidgetIdRef.current = null;
      }
    };
  }, [challengeMode, turnstileSiteKey, mode, registerStep, forgotStep]);

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
  const hasVariety =
    /[A-Z]/.test(password) && /[^A-Za-z0-9]/.test(password);
  const passwordStrength =
    password.length === 0
      ? 0
      : hasMinLen && hasLetterAndDigit && (password.length >= 12 || hasVariety)
        ? 3
        : hasMinLen && hasLetterAndDigit
          ? 2
          : 1;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

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

    if (mode === "forgot") {
      if (forgotStep === "email") {
        if (challengeMode === "turnstile") {
          if (!turnstileToken) {
            setError("Selesaikan verifikasi keamanan terlebih dahulu.");
            return;
          }
        } else if (!challengeToken || !challengeAnswer.trim()) {
          setError("Lengkapi jawaban verifikasi keamanan terlebih dahulu.");
          return;
        }
        setLoading(true);
        try {
          const res = await fetch("/api/auth/forgot-password/request-otp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email,
              website,
              turnstileToken:
                challengeMode === "turnstile" ? turnstileToken : undefined,
              challengeToken:
                challengeMode === "math" ? challengeToken : undefined,
              challengeAnswer:
                challengeMode === "math" ? challengeAnswer.trim() : undefined,
            }),
          });
          const data = (await res.json()) as {
            ok?: boolean;
            cooldownSeconds?: number;
            error?: string;
          };
          if (!res.ok || !data.ok) {
            setError(data.error || "Gagal mengirim kode reset kata sandi.");
            void fetchChallenge();
            return;
          }
          setOtpCode("");
          setPassword("");
          setConfirmPassword("");
          setOtpCooldown(data.cooldownSeconds ?? 60);
          setForgotStep("reset");
        } catch {
          setError("Gagal menghubungi server reset kata sandi.");
        } finally {
          setLoading(false);
        }
        return;
      }

      if (!/^\d{6}$/.test(otpCode.trim())) {
        setError("Masukkan 6 digit angka kode OTP dari email Anda.");
        return;
      }
      if (!hasMinLen || !hasLetterAndDigit) {
        setError(
          "Kata sandi baru wajib 8–72 karakter dengan kombinasi huruf dan angka."
        );
        return;
      }
      if (password !== confirmPassword) {
        setError("Konfirmasi kata sandi baru tidak cocok.");
        return;
      }

      setLoading(true);
      try {
        const res = await fetch("/api/auth/forgot-password/reset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            otp: otpCode.trim(),
            newPassword: password,
          }),
        });
        const data = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !data.ok) {
          setError(data.error || "Gagal mengatur ulang kata sandi.");
          return;
        }
        setMode("login");
        setForgotStep("email");
        setPassword("");
        setConfirmPassword("");
        setOtpCode("");
        setSuccessMsg(
          "Kata sandi berhasil diperbarui. Silakan masuk dengan kata sandi baru Anda."
        );
      } catch {
        setError("Gagal menghubungi server reset kata sandi.");
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
      if (challengeMode === "turnstile") {
        if (!turnstileToken) {
          setError("Selesaikan verifikasi keamanan terlebih dahulu.");
          return;
        }
      } else if (!challengeToken || !challengeAnswer.trim()) {
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
            turnstileToken:
              challengeMode === "turnstile" ? turnstileToken : undefined,
            challengeToken:
              challengeMode === "math" ? challengeToken : undefined,
            challengeAnswer:
              challengeMode === "math" ? challengeAnswer.trim() : undefined,
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

  const renderAntiBotBox = () => (
    <div className="rounded-xl border border-line-strong bg-canvas p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-accent-tint">
          <ShieldCheck className="h-3.5 w-3.5 text-accent-soft" />
          Verifikasi Anti-Bot
        </span>
        <button
          type="button"
          onClick={() => void fetchChallenge()}
          disabled={loadingChallenge}
          aria-label="Muat ulang verifikasi keamanan"
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-ink-secondary hover:bg-elevated hover:text-heading disabled:opacity-50"
        >
          <RefreshCw
            className={`h-3 w-3 ${loadingChallenge ? "animate-spin" : ""}`}
          />
          {challengeMode === "turnstile" ? "Muat ulang" : "Ganti soal"}
        </button>
      </div>

      {challengeMode === "turnstile" ? (
        <div
          ref={turnstileContainerRef}
          className="flex min-h-[65px] items-center justify-center overflow-hidden rounded-lg"
        />
      ) : (
        <div className="flex items-center gap-2.5">
          <span className="shrink-0 rounded-lg border border-line bg-surface px-3 py-1.5 font-mono text-xs font-semibold text-heading">
            {challengeQuestion || "Memuat..."}
          </span>
          <input
            type="text"
            inputMode="numeric"
            required
            value={challengeAnswer}
            onChange={(e) => setChallengeAnswer(e.target.value)}
            placeholder="Jawaban angka"
            className="min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm text-heading placeholder:text-ink-muted focus:border-accent-soft focus:outline-none"
          />
        </div>
      )}
    </div>
  );

  useBodyScrollLock(true);

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center overscroll-contain bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Akun SmartSari"
    >
      <div className="animate-modal-in max-h-[92vh] w-full max-w-md overflow-y-auto overscroll-contain rounded-2xl border border-line-strong bg-surface p-6 text-ink shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 text-accent-soft">
              <Cloud className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-heading">
                {mode === "forgot"
                  ? "Atur Ulang Kata Sandi"
                  : "Sinkronkan Ruang Riset"}
              </h2>
              <p className="text-xs text-ink-secondary">
                {mode === "forgot"
                  ? "Verifikasi email Anda dengan kode OTP 6 digit."
                  : "Simpan proyek, catatan & riwayat di semua perangkat."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup dialog akun"
            className="rounded-lg p-1.5 text-ink-secondary hover:bg-elevated hover:text-heading"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {mode !== "forgot" ? (
          <div className="mb-4 grid grid-cols-2 rounded-xl border border-line bg-canvas p-1">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setRegisterStep("form");
                setError(null);
                setSuccessMsg(null);
              }}
              className={`rounded-lg py-1.5 text-xs font-semibold transition-colors ${
                mode === "login"
                  ? "bg-accent text-white"
                  : "text-ink-secondary hover:text-heading"
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
                setSuccessMsg(null);
              }}
              className={`rounded-lg py-1.5 text-xs font-semibold transition-colors ${
                mode === "register"
                  ? "bg-accent text-white"
                  : "text-ink-secondary hover:text-heading"
              }`}
            >
              Daftar Akun Baru
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setForgotStep("email");
              setError(null);
            }}
            className="-ml-2 mb-4 inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-ink-body transition-colors hover:bg-elevated hover:text-heading"
          >
            <ArrowLeft className="h-3.5 w-3.5 text-accent-soft" />
            Kembali ke halaman Masuk
          </button>
        )}

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

          {mode === "forgot" && forgotStep === "email" && (
            <>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-ink-body">
                  Email Akun Terdaftar
                </span>
                <div className="flex items-center gap-2.5 rounded-xl border border-line-strong bg-canvas px-3 py-2 focus-within:border-accent-soft">
                  <Mail className="h-4 w-4 shrink-0 text-ink-muted" />
                  <input
                    type="email"
                    autoComplete="email"
                    autoFocus
                    required
                    maxLength={160}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nama@kampus.ac.id"
                    className="w-full bg-transparent text-sm text-heading placeholder:text-ink-muted focus:outline-none"
                  />
                </div>
              </label>
              {renderAntiBotBox()}
            </>
          )}

          {mode === "forgot" && forgotStep === "reset" && (
            <div className="space-y-3">
              <div className="rounded-xl border border-accent/35 bg-accent/10 p-3.5 text-xs leading-relaxed text-ink-strong">
                Jika <strong className="text-heading">{email}</strong> terdaftar,
                kode OTP 6 digit telah dikirim (berlaku 10 menit).
              </div>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-ink-body">
                  Kode OTP Email (6 Digit)
                </span>
                <div className="flex items-center gap-2.5 rounded-xl border border-line-strong bg-canvas px-3 py-2.5 focus-within:border-accent-soft">
                  <KeyRound className="h-4 w-4 shrink-0 text-accent-soft" />
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    maxLength={6}
                    required
                    value={otpCode}
                    onChange={(e) =>
                      setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    placeholder="000000"
                    className="w-full bg-transparent text-center font-mono text-lg font-bold tracking-[0.45em] text-heading placeholder:text-ink-faint focus:outline-none"
                  />
                </div>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-ink-body">
                  Kata Sandi Baru
                </span>
                <div className="flex items-center gap-2.5 rounded-xl border border-line-strong bg-canvas px-3 py-2 focus-within:border-accent-soft">
                  <Lock className="h-4 w-4 shrink-0 text-ink-muted" />
                  <input
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    minLength={8}
                    maxLength={72}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyUp={handlePasswordKeyEvent}
                    onKeyDown={handlePasswordKeyEvent}
                    placeholder="Min. 8 karakter (huruf & angka)"
                    className="w-full bg-transparent text-sm text-heading placeholder:text-ink-muted focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={
                      showPassword
                        ? "Sembunyikan kata sandi"
                        : "Tampilkan kata sandi"
                    }
                    className="rounded p-1 text-ink-muted transition-colors hover:text-heading"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </label>

              {capsLockOn && (
                <p className="text-[11px] font-medium text-warn">
                  Caps Lock aktif
                </p>
              )}

              {password.length > 0 && (
                <div className="space-y-1">
                  <div className="grid grid-cols-3 gap-1.5">
                    {[1, 2, 3].map((lvl) => (
                      <div
                        key={lvl}
                        className={`h-1 rounded-full transition-colors ${
                          passwordStrength >= lvl
                            ? passwordStrength === 3
                              ? "bg-ok"
                              : passwordStrength === 2
                                ? "bg-warn"
                                : "bg-danger"
                            : "bg-line"
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-[11px] text-ink-secondary">
                    Kekuatan kata sandi:{" "}
                    <span
                      className={
                        passwordStrength === 3
                          ? "font-medium text-ok"
                          : passwordStrength === 2
                            ? "font-medium text-warn"
                            : "font-medium text-danger"
                      }
                    >
                      {passwordStrength === 3
                        ? "Kuat"
                        : passwordStrength === 2
                          ? "Cukup"
                          : "Lemah"}
                    </span>
                  </p>
                </div>
              )}

              <div className="flex flex-wrap gap-3 text-[11px]">
                <span
                  className={`inline-flex items-center gap-1 ${
                    hasMinLen ? "text-ok" : "text-ink-muted"
                  }`}
                >
                  <Check className="h-3 w-3" />
                  8–72 karakter
                </span>
                <span
                  className={`inline-flex items-center gap-1 ${
                    hasLetterAndDigit ? "text-ok" : "text-ink-muted"
                  }`}
                >
                  <Check className="h-3 w-3" />
                  Kombinasi huruf &amp; angka
                </span>
              </div>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-ink-body">
                  Konfirmasi Kata Sandi Baru
                </span>
                <div className="flex items-center gap-2.5 rounded-xl border border-line-strong bg-canvas px-3 py-2 focus-within:border-accent-soft">
                  <Lock className="h-4 w-4 shrink-0 text-ink-muted" />
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    minLength={8}
                    maxLength={72}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    onKeyUp={handlePasswordKeyEvent}
                    onKeyDown={handlePasswordKeyEvent}
                    placeholder="Ulangi kata sandi baru"
                    className="w-full bg-transparent text-sm text-heading placeholder:text-ink-muted focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    aria-label={
                      showConfirmPassword
                        ? "Sembunyikan konfirmasi kata sandi"
                        : "Tampilkan konfirmasi kata sandi"
                    }
                    className="rounded p-1 text-ink-muted transition-colors hover:text-heading"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </label>

              {confirmPassword.length > 0 && (
                <p
                  className={`inline-flex items-center gap-1 text-[11px] ${
                    password === confirmPassword ? "text-ok" : "text-warn"
                  }`}
                >
                  <Check className="h-3 w-3" />
                  {password === confirmPassword
                    ? "Kata sandi cocok"
                    : "Konfirmasi kata sandi belum cocok"}
                </p>
              )}

              <button
                type="button"
                disabled={otpCooldown > 0}
                onClick={() => {
                  setForgotStep("email");
                  setError(null);
                }}
                className="inline-flex items-center gap-1.5 text-xs text-ink-secondary hover:text-heading disabled:opacity-50"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                {otpCooldown > 0
                  ? `Minta kode reset baru (${otpCooldown}d)`
                  : "Minta kode reset baru"}
              </button>
            </div>
          )}

          {mode === "register" && registerStep === "otp" && (
            <div className="space-y-3">
              <div className="rounded-xl border border-accent/35 bg-accent/10 p-3.5 text-xs leading-relaxed text-ink-strong">
                Jika <strong className="text-heading">{email}</strong> belum
                terdaftar dan valid, kode OTP 6 digit telah dikirim (berlaku 10
                menit). Sudah punya akun? Silakan masuk atau gunakan Lupa Kata
                Sandi.
              </div>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-ink-body">
                  Kode OTP Email (6 Digit)
                </span>
                <div className="flex items-center gap-2.5 rounded-xl border border-line-strong bg-canvas px-3 py-2.5 focus-within:border-accent-soft">
                  <KeyRound className="h-4 w-4 shrink-0 text-accent-soft" />
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    maxLength={6}
                    required
                    value={otpCode}
                    onChange={(e) =>
                      setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    placeholder="000000"
                    className="w-full bg-transparent text-center font-mono text-lg font-bold tracking-[0.45em] text-heading placeholder:text-ink-faint focus:outline-none"
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
                className="inline-flex items-center gap-1.5 text-xs text-ink-secondary hover:text-heading disabled:opacity-50"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                {otpCooldown > 0
                  ? `Ubah email / minta kode baru (${otpCooldown}d)`
                  : "Ubah email / minta kode baru"}
              </button>
            </div>
          )}

          {(mode === "login" ||
            (mode === "register" && registerStep === "form")) && (
            <>
              {mode === "register" && (
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-ink-body">
                    Nama Lengkap
                  </span>
                  <div className="flex items-center gap-2.5 rounded-xl border border-line-strong bg-canvas px-3 py-2 focus-within:border-accent-soft">
                    <User className="h-4 w-4 shrink-0 text-ink-muted" />
                    <input
                      type="text"
                      autoComplete="name"
                      autoFocus
                      required
                      minLength={2}
                      maxLength={80}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Nama peneliti / mahasiswa"
                      className="w-full bg-transparent text-sm text-heading placeholder:text-ink-muted focus:outline-none"
                    />
                  </div>
                </label>
              )}

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-ink-body">
                  Email
                </span>
                <div className="flex items-center gap-2.5 rounded-xl border border-line-strong bg-canvas px-3 py-2 focus-within:border-accent-soft">
                  <Mail className="h-4 w-4 shrink-0 text-ink-muted" />
                  <input
                    type="email"
                    autoComplete="email"
                    autoFocus={mode === "login"}
                    required
                    maxLength={160}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nama@kampus.ac.id"
                    className="w-full bg-transparent text-sm text-heading placeholder:text-ink-muted focus:outline-none"
                  />
                </div>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-ink-body">
                  Kata Sandi
                </span>
                <div className="flex items-center gap-2.5 rounded-xl border border-line-strong bg-canvas px-3 py-2 focus-within:border-accent-soft">
                  <Lock className="h-4 w-4 shrink-0 text-ink-muted" />
                  <input
                    type={showPassword ? "text" : "password"}
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                    required
                    minLength={mode === "register" ? 8 : 1}
                    maxLength={72}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyUp={handlePasswordKeyEvent}
                    onKeyDown={handlePasswordKeyEvent}
                    placeholder={
                      mode === "register"
                        ? "Min. 8 karakter (huruf & angka)"
                        : "Masukkan kata sandi"
                    }
                    className="w-full bg-transparent text-sm text-heading placeholder:text-ink-muted focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={
                      showPassword
                        ? "Sembunyikan kata sandi"
                        : "Tampilkan kata sandi"
                    }
                    className="rounded p-1 text-ink-muted transition-colors hover:text-heading"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </label>

              {capsLockOn && (
                <p className="text-[11px] font-medium text-warn">
                  Caps Lock aktif
                </p>
              )}

              {mode === "login" && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setMode("forgot");
                      setForgotStep("email");
                      setError(null);
                      setSuccessMsg(null);
                    }}
                    className="text-xs font-medium text-accent-soft hover:text-accent-tint"
                  >
                    Lupa kata sandi?
                  </button>
                </div>
              )}

              {mode === "register" && (
                <>
                  {password.length > 0 && (
                    <div className="space-y-1">
                      <div className="grid grid-cols-3 gap-1.5">
                        {[1, 2, 3].map((lvl) => (
                          <div
                            key={lvl}
                            className={`h-1 rounded-full transition-colors ${
                              passwordStrength >= lvl
                                ? passwordStrength === 3
                                  ? "bg-ok"
                                  : passwordStrength === 2
                                    ? "bg-warn"
                                    : "bg-danger"
                                : "bg-line"
                            }`}
                          />
                        ))}
                      </div>
                      <p className="text-[11px] text-ink-secondary">
                        Kekuatan kata sandi:{" "}
                        <span
                          className={
                            passwordStrength === 3
                              ? "font-medium text-ok"
                              : passwordStrength === 2
                                ? "font-medium text-warn"
                                : "font-medium text-danger"
                          }
                        >
                          {passwordStrength === 3
                            ? "Kuat"
                            : passwordStrength === 2
                              ? "Cukup"
                              : "Lemah"}
                        </span>
                      </p>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-3 text-[11px]">
                    <span
                      className={`inline-flex items-center gap-1 ${
                        hasMinLen ? "text-ok" : "text-ink-muted"
                      }`}
                    >
                      <Check className="h-3 w-3" />
                      8–72 karakter
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 ${
                        hasLetterAndDigit ? "text-ok" : "text-ink-muted"
                      }`}
                    >
                      <Check className="h-3 w-3" />
                      Kombinasi huruf &amp; angka
                    </span>
                  </div>

                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-ink-body">
                      Konfirmasi Kata Sandi
                    </span>
                    <div className="flex items-center gap-2.5 rounded-xl border border-line-strong bg-canvas px-3 py-2 focus-within:border-accent-soft">
                      <Lock className="h-4 w-4 shrink-0 text-ink-muted" />
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        autoComplete="new-password"
                        required
                        minLength={8}
                        maxLength={72}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        onKeyUp={handlePasswordKeyEvent}
                        onKeyDown={handlePasswordKeyEvent}
                        placeholder="Ulangi kata sandi"
                        className="w-full bg-transparent text-sm text-heading placeholder:text-ink-muted focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((v) => !v)}
                        aria-label={
                          showConfirmPassword
                            ? "Sembunyikan konfirmasi kata sandi"
                            : "Tampilkan konfirmasi kata sandi"
                        }
                        className="rounded p-1 text-ink-muted transition-colors hover:text-heading"
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </label>

                  {confirmPassword.length > 0 && (
                    <p
                      className={`inline-flex items-center gap-1 text-[11px] ${
                        password === confirmPassword ? "text-ok" : "text-warn"
                      }`}
                    >
                      <Check className="h-3 w-3" />
                      {password === confirmPassword
                        ? "Kata sandi cocok"
                        : "Konfirmasi kata sandi belum cocok"}
                    </p>
                  )}

                  {renderAntiBotBox()}
                </>
              )}
            </>
          )}

          {successMsg && (
            <p className="rounded-lg border border-ok/35 bg-ok/10 px-3 py-2 text-xs text-ok-soft">
              {successMsg}
            </p>
          )}

          {error && (
            <p className="rounded-lg border border-danger/35 bg-danger/10 px-3 py-2 text-xs text-danger-soft">
              {error}
            </p>
          )}

          <p className="text-[11px] leading-relaxed text-ink-muted">
            {mode === "login"
              ? "Jurnal tersimpan, proyek riset, dan riwayat di perangkat ini akan otomatis digabungkan ke akun Anda."
              : "Dilindungi verifikasi OTP email, proteksi anti-bot, dan enkripsi kata sandi standar industri."}
          </p>

          <button
            type="submit"
            disabled={loading}
            className="btn-tactile flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-2.5 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "login"
              ? "Masuk & Sinkronkan"
              : mode === "register"
                ? registerStep === "form"
                  ? "Kirim Kode OTP ke Email"
                  : "Verifikasi & Buat Akun"
                : forgotStep === "email"
                  ? "Kirim Kode Reset ke Email"
                  : "Simpan Kata Sandi Baru"}
          </button>
        </form>
      </div>
    </div>
  );
}
