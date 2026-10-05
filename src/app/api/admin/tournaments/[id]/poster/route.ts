import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import QRCode from "qrcode";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { guardOperatorPermission } from "@/lib/operatorAuthorization";
import { TournamentPoster } from "@/lib/posters/tournamentPoster";
import { getTournamentPosterData } from "@/lib/posters/getTournamentPosterData";
import { getPosterProductionBackground } from "@/lib/posters/getPosterProductionBackground";

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

function toDataUrl(buffer: Buffer, mime: string) {
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

async function qrDataUrl(value: string) {
  const svg = await QRCode.toString(value, {
    type: "svg",
    width: 132,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#061123", light: "#ffffff" },
  });
  const png = new Resvg(svg, { fitTo: { mode: "width", value: 132 } }).render().asPng();
  return toDataUrl(Buffer.from(png), "image/png");
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const denied = await guardOperatorPermission("tournaments.manage");
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

    let circuitName: string | null = null;
    if (t.circuit_id) {
      const { data: circuit, error: circuitError } = await sb
        .from("circuits")
        .select("name")
        .eq("id", t.circuit_id)
        .single();
      if (circuitError || !circuit) {
        return NextResponse.json({ error: "Circuito associato non trovato" }, { status: 500 });
      }
      circuitName = String(circuit.name ?? "").trim() || null;
    }

    const publicTournamentUrl = new URL("/tornei", req.url);
    publicTournamentUrl.searchParams.set("tournament", id);
    const posterData = getTournamentPosterData({
      id: t.id,
      name: t.name,
      type: t.type,
      category: t.category,
      level: t.level,
      date: t.date,
      time: t.time,
      club_name: t.location,
      max_participants: t.max_participants,
      circuit_name: circuitName,
      qr_url: publicTournamentUrl.toString(),
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
    const logoPath = join(process.cwd(), "public", "branding", "movi-padelleria.png");
    const backgroundPublicPath = getPosterProductionBackground(t.type, t.category);
    const backgroundPath = backgroundPublicPath
      ? join(process.cwd(), "public", backgroundPublicPath.replace(/^\//, ""))
      : null;

    const [interRegularData, interMediumData, interSemiBoldData, bebasData, logoData, backgroundData] =
      await Promise.all([
        readFile(interRegularPath),
        readFile(interMediumPath),
        readFile(interSemiBoldPath),
        readFile(bebasPath),
        readFile(logoPath),
        backgroundPath ? readFile(backgroundPath) : Promise.resolve(null),
      ]);

    const svg = await satori(
      TournamentPoster({
        logo: toDataUrl(logoData, "image/png"),
        qrImage: await qrDataUrl(posterData.qrUrl),
        data: posterData,
        mode: "production",
        backgroundImage: backgroundData ? toDataUrl(backgroundData, "image/png") : undefined,
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
