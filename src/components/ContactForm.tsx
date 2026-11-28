"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Loader2,
  Mail,
  MessageSquare,
  RefreshCw,
  Send,
  ShieldCheck,
  User,
} from "lucide-react";
import { getActiveResolvedTheme } from "@/lib/appearance";

type ContactCategory = "bantuan" | "hapus_akun" | "masukan" | "lainnya";

export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [category, setCategory] = useState<ContactCategory>("bantuan");
  const [message, setMessage] = useState("");
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

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

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
    queueMicrotask(() => {
      void fetchChallenge();
    });
  }, [fetchChallenge]);

  useEffect(() => {
    if (challengeMode !== "turnstile" || !turnstileSiteKey) {
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
  }, [challengeMode, turnstileSiteKey]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (challengeMode === "turnstile") {
      if (!turnstileToken) {
        setError("Selesaikan verifikasi keamanan terlebih dahulu.");
        return;
      }
    } else if (!challengeToken || !challengeAnswer.trim()) {
      setError("Lengkapi jawaban verifikasi keamanan terlebih dahulu.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          category,
          message,
          website,
          turnstileToken:
            challengeMode === "turnstile" ? turnstileToken : undefined,
          challengeToken:
            challengeMode === "math" ? challengeToken : undefined,
          challengeAnswer:
            challengeMode === "math" ? challengeAnswer.trim() : undefined,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error || "Gagal mengirim pesan. Silakan coba lagi.");
        void fetchChallenge();
        return;
      }

      setSuccess(true);
      setMessage("");
      setChallengeAnswer("");
      void fetchChallenge();
    } catch {
      setError("Gagal menghubungi server. Silakan coba beberapa saat lagi.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <div className="sr-only" aria-hidden="true">
        <label htmlFor="smartsari-contact-website">Website</label>
        <input
          id="smartsari-contact-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      <p className="text-[11px] text-ink-muted">
        Kolom bertanda <span className="font-semibold text-accent-soft">*</span>{" "}
        wajib diisi.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-ink-body">
            Nama Lengkap <span className="text-accent-soft">*</span>
          </span>
          <div className="flex items-center gap-2.5 rounded-xl border border-line-strong bg-canvas px-3 py-2.5 focus-within:border-accent-soft">
            <User className="h-4 w-4 shrink-0 text-ink-muted" />
            <input
              type="text"
              required
              minLength={2}
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nama Anda"
              className="w-full bg-transparent text-sm text-heading placeholder:text-ink-muted focus:outline-none"
            />
          </div>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-ink-body">
            Email Balasan <span className="text-accent-soft">*</span>
          </span>
          <div className="flex items-center gap-2.5 rounded-xl border border-line-strong bg-canvas px-3 py-2.5 focus-within:border-accent-soft">
            <Mail className="h-4 w-4 shrink-0 text-ink-muted" />
            <input
              type="email"
              required
              maxLength={160}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@kampus.ac.id"
              className="w-full bg-transparent text-sm text-heading placeholder:text-ink-muted focus:outline-none"
            />
          </div>
        </label>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-ink-body">
          Kategori Keperluan <span className="text-accent-soft">*</span>
        </span>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as ContactCategory)}
          className="w-full rounded-xl border border-line-strong bg-canvas px-3 py-2.5 text-sm text-heading focus:border-accent-soft focus:outline-none"
        >
          <option value="bantuan">Bantuan Teknis &amp; Penggunaan</option>
          <option value="hapus_akun">
            Permintaan Hapus Akun / Data (UU PDP)
          </option>
          <option value="masukan">Saran &amp; Masukan Fitur</option>
          <option value="lainnya">Lainnya</option>
        </select>
      </label>

      <label className="block">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-body">
            <MessageSquare className="h-3.5 w-3.5 text-accent-soft" />
            <span>
              Pesan <span className="text-accent-soft">*</span>
            </span>
          </span>
          <span className="font-mono text-[11px] text-ink-muted">
            {message.length}/2000
          </span>
        </div>
        <textarea
          required
          minLength={10}
          maxLength={2000}
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Tuliskan pertanyaan, kendala, atau permintaan penghapusan akun Anda..."
          className="w-full rounded-xl border border-line-strong bg-canvas px-3.5 py-2.5 text-sm text-heading placeholder:text-ink-muted focus:border-accent-soft focus:outline-none"
        />
      </label>

      <div className="rounded-xl border border-line-strong bg-canvas p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-accent-tint">
            <ShieldCheck className="h-3.5 w-3.5 text-accent-soft" />
            Verifikasi Anti-Bot <span className="text-accent-soft">*</span>
          </span>
          <button
            type="button"
            onClick={() => void fetchChallenge()}
            disabled={loadingChallenge}
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

      {success && (
        <div className="flex items-start gap-2 rounded-xl border border-ok/35 bg-ok/10 px-3.5 py-2.5 text-xs text-ok-soft">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Pesan Anda berhasil dikirim ke tim SmartSari by AirEvo. Balasan akan
            dikirim ke alamat email Anda.
          </span>
        </div>
      )}

      {error && (
        <p className="rounded-xl border border-danger/35 bg-danger/10 px-3.5 py-2.5 text-xs text-danger-soft">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="btn-tactile inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl bg-accent py-2.5 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
      >
        {submitting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
        Kirim Pesan
      </button>
    </form>
  );
}
