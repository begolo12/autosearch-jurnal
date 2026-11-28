import type { Metadata } from "next";
import { Mail } from "lucide-react";
import { ContactForm } from "@/components/ContactForm";
import { LegalPageShell } from "@/components/LegalPageShell";

export const metadata: Metadata = {
  title: "Kontak & Bantuan — SmartSari by AirEvo",
  description:
    "Hubungi tim SmartSari by AirEvo untuk bantuan teknis, masukan fitur, atau permintaan pelindungan data pribadi sesuai UU PDP.",
};

export default function KontakPage() {
  return (
    <LegalPageShell
      badgeIcon={<Mail className="h-3.5 w-3.5" />}
      badgeLabel="Layanan Pengguna &amp; Privasi"
      title="Hubungi SmartSari"
      subtitle="Kirimkan pertanyaan teknis, laporan kendala, masukan fitur, atau permintaan penghapusan akun (UU PDP). Pesan Anda langsung diteruskan ke kotak masuk tim AirEvo."
      metaText="SmartSari by AirEvo · Layanan Dukungan Pengguna"
      currentPath="/kontak"
    >
      <div className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
        <ContactForm />
      </div>
    </LegalPageShell>
  );
}
