import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { guardAdmin } from "@/lib/adminGuard";
import { TournamentPoster } from "@/lib/posters/tournamentPoster";
import { getTournamentPosterData } from "@/lib/posters/getTournamentPosterData";

export const runtime = "nodejs";

type TournamentRow = {
  id: string;
  name: string | null;
  type: string | null;
  category: string | null;
  level: string | null;
  date: string | null;
  time: string | null;
  location: string | null;
  max_participants: number | null;
  circuit_id: string | null;
};

type PosterVariant = "baraonda" | "fixed_pairs" | "padelseries";

function toDataUrl(buffer: Buffer, mime: string) {
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

function normalizeTournamentType(type: string | null) {
  const raw = String(type ?? "").trim().toLowerCase();

  if (raw === "baraonda") {
    return "baraonda" as const;
  }

  if (raw === "coppie fisse") {
    return "fixed_pairs" as const;
  }

  return "baraonda" as const;
}

function normalizeCategory(category: string | null) {
  return String(category ?? "").trim().toLowerCase();
}

function normalizeLevel(level: string | null) {
  return String(level ?? "").trim().toLowerCase();
}

function getStandardBackgroundPath(normalizedType: "baraonda" | "fixed_pairs") {
  if (normalizedType === "fixed_pairs") {
    return join(process.cwd(), "public", "posters", "coppie-fisse-base.png");
  }

  return join(process.cwd(), "public", "posters", "baraonda-base.png");
}

function getPadelSeriesBackgroundPath(params: {
  category: string | null;
  level: string | null;
}) {
  const category = normalizeCategory(params.category);
  const level = normalizeLevel(params.level);

  if (category === "maschile" && level === "avanzato") {
    return join(
      process.cwd(),
      "public",
      "posters",
      "padelseries-maschile-avanzato.png"
    );
  }

  if (category === "misto" && level === "avanzato") {
    return join(
      process.cwd(),
      "public",
      "posters",
      "padelseries-misto-avanzato.png"
    );
  }

  if (category === "femminile" && level === "avanzato") {
    return join(
      process.cwd(),
      "public",
      "posters",
      "padelseries-femminile-avanzato.png"
    );
  }

  if (category === "femminile" && level === "principiante") {
    return join(
      process.cwd(),
      "public",
      "posters",
      "padelseries-femminile-principiante.png"
    );
  }

  return null;
}

function resolvePosterConfig(t: TournamentRow): {
  variant: PosterVariant;
  backgroundPath: string;
} {
  const normalizedType = normalizeTournamentType(t.type);

  if (t.circuit_id) {
    const padelSeriesPath = getPadelSeriesBackgroundPath({
      category: t.category,
      level: t.level,
    });

    if (padelSeriesPath) {
      return {
        variant: "padelseries",
        backgroundPath: padelSeriesPath,
      };
    }
  }

  return {
    variant: normalizedType,
    backgroundPath: getStandardBackgroundPath(normalizedType),
  };
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const denied = await guardAdmin(req);
    if (denied) return denied;

    const { id } = await ctx.params;

    if (!id) {
      return NextResponse.json(
        { error: "Missing tournamentId" },
        { status: 400 }
      );
    }

    const sb = supabaseAdmin();

    const { data, error } = await sb
      .from("tournaments")
      .select(
        "id,name,type,category,level,date,time,location,max_participants,circuit_id"
      )
      .eq("id", id)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? "Torneo non trovato" },
        { status: 404 }
      );
    }

    const t = data as TournamentRow;

    if (
      !t.type ||
      !t.category ||
      !t.date ||
      !t.time ||
      !t.location ||
      !t.max_participants
    ) {
      return NextResponse.json(
        { error: "Dati torneo incompleti per generare la locandina" },
        { status: 400 }
      );
    }

    const posterData = getTournamentPosterData({
      category: t.category,
      level: t.level,
      date: t.date,
      time: t.time,
      club_name: t.location,
      max_participants: t.max_participants,
    });

    const interRegularPath = join(
      process.cwd(),
      "public",
      "fonts",
      "Inter-Regular.ttf"
    );
    const interMediumPath = join(
      process.cwd(),
      "public",
      "fonts",
      "Inter-Medium.ttf"
    );
    const interSemiBoldPath = join(
      process.cwd(),
      "public",
      "fonts",
      "Inter-SemiBold.ttf"
    );
    const bebasPath = join(
      process.cwd(),
      "public",
      "fonts",
      "BebasNeue-Regular.ttf"
    );

    const [interRegularData, interMediumData, interSemiBoldData, bebasData] =
      await Promise.all([
        readFile(interRegularPath),
        readFile(interMediumPath),
        readFile(interSemiBoldPath),
        readFile(bebasPath),
      ]);

    const posterConfig = resolvePosterConfig(t);

    const backgroundBuffer = await readFile(posterConfig.backgroundPath);
    const backgroundDataUrl = toDataUrl(backgroundBuffer, "image/png");

    const svg = await satori(
      TournamentPoster({
        background: backgroundDataUrl,
        data: posterData,
        variant: posterConfig.variant,
      }),
      {
        width: 1080,
        height: 1350,
        fonts: [
          {
            name: "Inter",
            data: interRegularData,
            weight: 400,
            style: "normal",
          },
          {
            name: "Inter",
            data: interMediumData,
            weight: 500,
            style: "normal",
          },
          {
            name: "Inter",
            data: interSemiBoldData,
            weight: 600,
            style: "normal",
          },
          {
            name: "Bebas",
            data: bebasData,
            weight: 400,
            style: "normal",
          },
        ],
      }
    );

    const resvg = new Resvg(svg, {
      fitTo: {
        mode: "width",
        value: 1080,
      },
    });

    const pngBuffer = resvg.render().asPng();
    const pngBytes = new Uint8Array(pngBuffer);

    const safeName = String(t.name ?? "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);

        const url = new URL(req.url);
    const dispositionMode = url.searchParams.get("disposition");
    const contentDisposition =
      dispositionMode === "inline"
        ? `inline; filename="locandina-${safeName || id}.png"`
        : `attachment; filename="locandina-${safeName || id}.png"`;

    return new NextResponse(pngBytes, {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": contentDisposition,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("POSTER_ROUTE_ERROR", err);

    return NextResponse.json(
      {
        error: "Errore interno generazione locandina",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}