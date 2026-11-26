import crypto from "crypto";

export function hashOtp(
  otp: string,
  email: string,
  expiresAtMs: number
): string {
  return crypto
    .createHash("sha256")
    .update(`smartsari-otp:${email.trim().toLowerCase()}:${otp}:${expiresAtMs}`)
    .digest("hex");
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function postResendEmail(params: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{ ok: boolean; status: number; message?: string }> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: params.from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
      text: params.text,
    }),
    signal: AbortSignal.timeout(12000),
  });

  if (res.ok) {
    return { ok: true, status: res.status };
  }

  const errBody = (await res.json().catch(() => ({}))) as {
    message?: string;
  };
  return {
    ok: false,
    status: res.status,
    message: errBody.message || `Resend HTTP ${res.status}`,
  };
}

async function sendBrandedOtpEmail(params: {
  to: string;
  name: string;
  otp: string;
  subject: string;
  introText: string;
  ignoreText: string;
}): Promise<{ ok: true; usedSandbox: boolean } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      error: "Layanan email OTP belum dikonfigurasi di server.",
    };
  }

  const primaryFrom =
    process.env.RESEND_FROM_EMAIL?.trim() ||
    "SmartSari <no-reply@smartsari.my.id>";
  const safeName = escapeHtml(params.name);

  const html = `
  <div style="background:#0E0F12;padding:28px 16px;font-family:Inter,Arial,sans-serif;color:#F4F4F5;">
    <div style="max-width:480px;margin:0 auto;background:#151619;border:1px solid #2C2E35;border-radius:16px;padding:28px;">
      <div style="font-size:16px;font-weight:700;letter-spacing:-0.01em;margin-bottom:16px;">
        Smart<span style="color:#F472B6;">Sari</span>
      </div>
      <p style="font-size:14px;line-height:1.6;color:#E4E4E7;margin:0 0 14px;">
        Halo <strong>${safeName}</strong>,
      </p>
      <p style="font-size:14px;line-height:1.6;color:#A1A1AA;margin:0 0 20px;">
        ${escapeHtml(params.introText)} Kode ini berlaku selama <strong>10 menit</strong>.
      </p>
      <div style="background:#0E0F12;border:1px solid #DB2777;border-radius:12px;padding:16px;text-align:center;margin:0 0 20px;">
        <span style="font-family:'JetBrains Mono',Consolas,monospace;font-size:30px;font-weight:700;letter-spacing:8px;color:#F9A8D4;">
          ${params.otp}
        </span>
      </div>
      <p style="font-size:12px;line-height:1.5;color:#71717A;margin:0;">
        ${escapeHtml(params.ignoreText)} Jangan bagikan kode ini kepada siapa pun.
      </p>
    </div>
  </div>`;

  const text = `Halo ${params.name},\n\n${params.introText}\nKode OTP Anda: ${params.otp} (berlaku 10 menit).\n\n${params.ignoreText}`;

  const firstTry = await postResendEmail({
    apiKey,
    from: primaryFrom,
    to: params.to,
    subject: params.subject,
    html,
    text,
  });

  if (firstTry.ok) {
    return { ok: true, usedSandbox: false };
  }

  if (firstTry.status === 403 && !primaryFrom.includes("resend.dev")) {
    const fallbackTry = await postResendEmail({
      apiKey,
      from: "SmartSari <onboarding@resend.dev>",
      to: params.to,
      subject: params.subject,
      html,
      text,
    });

    if (fallbackTry.ok) {
      return { ok: true, usedSandbox: true };
    }

    return {
      ok: false,
      error: fallbackTry.message || "Gagal mengirim email OTP.",
    };
  }

  return {
    ok: false,
    error: firstTry.message || "Gagal mengirim email OTP.",
  };
}

export async function sendRegistrationOtpEmail(params: {
  to: string;
  name: string;
  otp: string;
}) {
  return sendBrandedOtpEmail({
    to: params.to,
    name: params.name,
    otp: params.otp,
    subject: `${params.otp} — Kode Verifikasi Akun SmartSari`,
    introText:
      "Gunakan kode OTP berikut untuk menyelesaikan pendaftaran akun SmartSari Anda.",
    ignoreText: "Jika Anda tidak merasa mendaftar di SmartSari, abaikan email ini.",
  });
}

export async function sendPasswordResetOtpEmail(params: {
  to: string;
  name: string;
  otp: string;
}) {
  return sendBrandedOtpEmail({
    to: params.to,
    name: params.name,
    otp: params.otp,
    subject: `${params.otp} — Kode Reset Kata Sandi SmartSari`,
    introText:
      "Kami menerima permintaan untuk mengatur ulang kata sandi akun SmartSari Anda. Masukkan kode OTP berikut:",
    ignoreText:
      "Jika Anda tidak meminta reset kata sandi, abaikan email ini — akun Anda tetap aman.",
  });
}
