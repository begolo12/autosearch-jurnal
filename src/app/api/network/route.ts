import crypto from "crypto";
import { and, eq, gt } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { searchCache } from "@/db/schema";
import { checkRateLimit } from "@/lib/rate-limit";
import { fetchCitationNetwork } from "@/lib/search/network";
import type { CitationNetworkResponse } from "@/lib/types";

const NETWORK_CACHE_TTL_MS = 1000 * 60 * 60 * 24;

export async function GET(request: NextRequest) {
  const rl = await checkRateLimit(request, "network", 25, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: `Terlalu banyak permintaan jejaring. Tunggu ${rl.retryAfterSeconds} detik.`,
      },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  const title = (request.nextUrl.searchParams.get("title") || "").trim();
  const doi = (request.nextUrl.searchParams.get("doi") || "").trim() || null;

  if (title.length < 2) {
    return NextResponse.json(
      { error: "Judul jurnal wajib diisi minimal 2 karakter." },
      { status: 400 }
    );
  }

  if (title.length > 400 || (doi && doi.length > 200)) {
    return NextResponse.json(
      { error: "Parameter judul atau DOI terlalu panjang." },
      { status: 400 }
    );
  }

  const cacheKey = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        v: 1,
        kind: "network",
        title: title.toLowerCase(),
        doi: doi?.toLowerCase() || null,
      })
    )
    .digest("hex");

  const db = getDb();
  try {
    const cached = await db
      .select()
      .from(searchCache)
      .where(
        and(
          eq(searchCache.cacheKey, cacheKey),
          gt(searchCache.expiresAt, new Date())
        )
      )
      .limit(1);

    if (cached.length > 0) {
      return NextResponse.json(cached[0].payload as CitationNetworkResponse, {
        headers: { "X-Network-Cache": "HIT" },
      });
    }
  } catch (err) {
    console.warn("Network cache read failed:", err);
  }

  const network = await fetchCitationNetwork({ title, doi });

  if (
    network.citing.length > 0 ||
    network.references.length > 0 ||
    network.related.length > 0
  ) {
    try {
      const expiresAt = new Date(Date.now() + NETWORK_CACHE_TTL_MS);
      await db
        .insert(searchCache)
        .values({
          cacheKey,
          payload: network,
          expiresAt,
        })
        .onConflictDoUpdate({
          target: searchCache.cacheKey,
          set: {
            payload: network,
            createdAt: new Date(),
            expiresAt,
          },
        });
    } catch (err) {
      console.warn("Network cache write failed:", err);
    }
  }

  return NextResponse.json(network, {
    headers: { "X-Network-Cache": "MISS" },
  });
}
