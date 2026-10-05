/* eslint-disable @next/next/no-img-element */
import React from "react";
import type { TournamentPosterData } from "./getTournamentPosterData";
import { showSponsorPlaceholder, TOURNAMENT_POSTER_LAYOUT, type TournamentPosterMode } from "./tournamentPosterLayout";

const cyan = "#18c8ff";
const blue = "#2458ff";
const magenta = "#d62cff";
const navy = "#061123";

function titleSize(name: string) {
  if (name.length > 45) return 62;
  if (name.length > 28) return 74;
  return 88;
}

function MetaIcon({ type }: { type: "category" | "level" | "time" | "capacity" }) {
  if (type === "time") {
    return <span style={{ width: 34, height: 34, position: "relative", display: "flex", flexShrink: 0, border: `2px solid ${cyan}`, borderRadius: 99 }}><span style={{ position: "absolute", left: 15, top: 6, width: 2, height: 10, display: "flex", background: cyan }} /><span style={{ position: "absolute", left: 15, top: 15, width: 8, height: 2, display: "flex", background: cyan, transform: "rotate(28deg)", transformOrigin: "left center" }} /></span>;
  }
  if (type === "level") {
    return <span style={{ width: 34, height: 34, display: "flex", flexDirection: "column", justifyContent: "center", gap: 4, flexShrink: 0 }}><span style={{ width: 13, height: 3, display: "flex", background: cyan }} /><span style={{ width: 21, height: 3, display: "flex", background: cyan }} /><span style={{ width: 30, height: 3, display: "flex", background: cyan }} /></span>;
  }
  const isCapacity = type === "capacity";
  return <span style={{ width: 34, height: 34, position: "relative", display: "flex", flexShrink: 0 }}><span style={{ position: "absolute", left: isCapacity ? 4 : 10, top: 4, width: 10, height: 10, display: "flex", border: `2px solid ${cyan}`, borderRadius: 99 }} /><span style={{ position: "absolute", left: isCapacity ? 1 : 6, top: 17, width: 18, height: 12, display: "flex", border: `2px solid ${cyan}`, borderRadius: "10px 10px 3px 3px" }} />{isCapacity ? <><span style={{ position: "absolute", right: 3, top: 7, width: 8, height: 8, display: "flex", border: `2px solid ${cyan}`, borderRadius: 99 }} /><span style={{ position: "absolute", right: 0, top: 19, width: 15, height: 10, display: "flex", border: `2px solid ${cyan}`, borderRadius: "9px 9px 3px 3px" }} /></> : null}</span>;
}

export function TournamentPoster({ logo, qrImage, data, mode = "production", backgroundImage }: { logo: string; qrImage: string; data: TournamentPosterData; mode?: TournamentPosterMode; backgroundImage?: string }) {
  const hasCircuit = Boolean(data.circuitName);
  const showSponsorReviewLayer = showSponsorPlaceholder(mode);
  return (
    <div style={{ width: 1080, height: 1350, display: "flex", position: "relative", overflow: "hidden", flexDirection: "column", background: navy, color: "#ffffff", fontFamily: "Inter" }}>
      {backgroundImage ? <img src={backgroundImage} alt="" width={1080} height={1350} style={{ position: "absolute", inset: 0, width: 1080, height: 1350, objectFit: "contain" }} /> : <><div style={{ position: "absolute", inset: 0, display: "flex", backgroundImage: "linear-gradient(145deg, #07162c 0%, #061123 48%, #091a31 100%)" }} /><div style={{ position: "absolute", left: -180, top: 330, width: 960, height: 390, display: "flex", border: "2px solid rgba(24,200,255,.16)", transform: "rotate(-15deg)" }} /><div style={{ position: "absolute", left: 270, top: 125, width: 940, height: 500, display: "flex", border: "2px solid rgba(36,88,255,.13)", transform: "rotate(18deg)" }} /><div style={{ position: "absolute", inset: 32, display: "flex", border: "2px solid rgba(115,190,255,.46)" }} /></>}
      <img src={logo} alt="MOVI Padelleria" width={340} height={91} style={{ position: "absolute", left: 64, top: 58, objectFit: "contain" }} />

      <div style={{ position: "absolute", right: 54, top: 48, width: 164, height: 192, border: "2px solid rgba(180,224,255,.78)", borderRadius: 9, background: "rgba(3,13,29,.9)", boxShadow: "0 16px 42px rgba(0,0,0,.46)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: ".14em", color: "#d9e8f6" }}>{data.dateDayName}</span>
        <span style={{ fontFamily: "Bebas", fontSize: 96, lineHeight: .84, color: "#ffffff", textShadow: "0 5px 18px rgba(0,0,0,.55)" }}>{data.dateDayNumber}</span>
        <span style={{ marginTop: 5, fontSize: 29, fontWeight: 800, letterSpacing: ".12em", color: cyan }}>{data.dateMonth}</span>
      </div>

      {hasCircuit ? <div style={{ position: "absolute", left: 70, top: 320, maxWidth: 780, display: "flex", alignItems: "center", gap: 15, color: cyan, fontSize: 29, fontWeight: 800, letterSpacing: ".115em", textTransform: "uppercase", textShadow: "0 5px 18px rgba(0,0,0,.78)" }}><span style={{ width: 46, height: 4, display: "flex", background: cyan }} />{data.circuitName}<span style={{ width: 98, height: 2, display: "flex", background: "rgba(24,200,255,.68)" }} /></div> : null}
      <div style={{ position: "absolute", left: 70, top: hasCircuit ? 356 : 318, width: 820, height: 245, display: "flex", flexDirection: "column", justifyContent: "center", overflow: "hidden" }}>
        <div style={{ display: "flex", fontFamily: "Bebas", fontSize: titleSize(data.name), lineHeight: .92, letterSpacing: ".015em", textTransform: "uppercase", color: "#ffffff", textShadow: "0 8px 28px rgba(0,0,0,.45)" }}>{data.name}</div>
        <span style={{ width: 118, height: 5, marginTop: 20, display: "flex", background: cyan }} />
      </div>

      <div style={{ position: "absolute", left: 70, top: 622, width: 590, height: 260, padding: "18px 24px 18px 26px", display: "flex", flexDirection: "column", border: "1px solid rgba(145,205,245,.42)", borderLeft: `5px solid ${cyan}`, background: "rgba(3,18,38,.88)", boxShadow: "0 18px 44px rgba(0,0,0,.3)", textShadow: "0 3px 12px rgba(0,0,0,.72)" }}>
        <div style={{ height: 102, display: "flex", borderBottom: "1px solid rgba(130,193,235,.36)" }}>
          <div style={{ width: "50%", display: "flex", alignItems: "center", gap: 14, paddingRight: 18 }}><MetaIcon type="category" /><span style={{ display: "flex", flexDirection: "column" }}><span style={{ color: "#b9cde0", fontSize: 15, fontWeight: 700, letterSpacing: ".16em" }}>CATEGORIA</span><span style={{ marginTop: 6, color: "#ffffff", fontSize: 28, fontWeight: 800, letterSpacing: ".075em" }}>{data.category || "OPEN"}</span></span></div>
          <div style={{ width: "50%", display: "flex", alignItems: "center", gap: 14, paddingLeft: 22, borderLeft: "1px solid rgba(130,193,235,.32)" }}><MetaIcon type="level" /><span style={{ display: "flex", flexDirection: "column" }}><span style={{ color: "#b9cde0", fontSize: 15, fontWeight: 700, letterSpacing: ".16em" }}>LIVELLO</span>{data.level ? <span style={{ marginTop: 6, color: cyan, fontSize: 27, fontWeight: 800, letterSpacing: ".06em" }}>{data.level}</span> : null}</span></div>
        </div>
        <div style={{ height: 121, display: "flex" }}>
          <div style={{ width: "50%", display: "flex", alignItems: "center", gap: 14, paddingRight: 18 }}><MetaIcon type="time" /><span style={{ display: "flex", flexDirection: "column" }}><span style={{ color: "#b9cde0", fontSize: 16, fontWeight: 700, letterSpacing: ".16em" }}>ORA</span><span style={{ marginTop: 2, fontFamily: "Bebas", fontSize: 66, lineHeight: .9, color: "#ffffff" }}>{data.time}</span></span></div>
          <div style={{ width: "50%", display: "flex", alignItems: "center", gap: 14, paddingLeft: 22, borderLeft: "1px solid rgba(130,193,235,.32)" }}><MetaIcon type="capacity" /><span style={{ display: "flex", flexDirection: "column" }}><span style={{ color: "#b9cde0", fontSize: 16, fontWeight: 700, letterSpacing: ".105em" }}>{data.capacityLabel}</span><span style={{ marginTop: 2, fontFamily: "Bebas", fontSize: 68, lineHeight: .9, color: cyan }}>{data.capacity}</span></span></div>
        </div>
      </div>

      <div style={{ position: "absolute", right: 70, top: 607, width: 295, height: 282, padding: "15px 8px 15px 18px", display: "flex", flexDirection: "column", justifyContent: "space-between", border: "1px solid rgba(145,205,245,.34)", background: "rgba(3,18,38,.82)", boxShadow: "0 18px 44px rgba(0,0,0,.28)" }}>
        {data.venues.map((venue) => <div key={venue.name} style={{ minHeight: 45, display: "flex", alignItems: "center", gap: 11, padding: "6px 11px", borderRadius: 999, background: venue.active ? "rgba(214,44,255,.2)" : "rgba(6,28,52,.58)", color: venue.active ? "#ffffff" : "#d2e0ec", border: venue.active ? `3px solid ${magenta}` : "1px solid rgba(150,199,230,.24)", boxShadow: venue.active ? "0 0 24px rgba(214,44,255,.34)" : "none", fontSize: venue.active ? 21 : 19, fontWeight: venue.active ? 800 : 650, letterSpacing: ".045em", textShadow: "0 3px 12px rgba(0,0,0,.74)" }}><span style={{ width: 9, height: 9, display: "flex", flexShrink: 0, transform: "rotate(45deg)", border: `2px solid ${venue.active ? "#ffffff" : "#78a3c2"}`, background: venue.active ? magenta : "rgba(120,163,194,.18)" }} />{venue.name.toUpperCase()}</div>)}
      </div>

      {showSponsorReviewLayer ? <div style={{ position: "absolute", left: 70, right: 70, top: TOURNAMENT_POSTER_LAYOUT.sponsorZone.top, height: TOURNAMENT_POSTER_LAYOUT.sponsorZone.height, display: "flex", alignItems: "center", justifyContent: "center", borderTop: "1px solid rgba(120,180,225,.3)", borderBottom: "1px solid rgba(120,180,225,.3)", background: "rgba(12,31,55,.3)" }}><span style={{ color: "#6f879d", fontSize: 15, fontWeight: 600, letterSpacing: ".23em" }}>MATRICE V1 · AREA SPONSOR</span></div> : null}

      <div style={{ position: "absolute", left: 70, right: 70, top: TOURNAMENT_POSTER_LAYOUT.footerTop, height: 176, padding: "20px 26px 20px 30px", display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid rgba(120,180,225,.28)", borderBottom: "1px solid rgba(120,180,225,.2)", background: "linear-gradient(90deg, rgba(8,27,52,.76), rgba(8,27,52,.38))", borderLeft: `4px solid ${blue}` }}>
        <div style={{ display: "flex", flexDirection: "column" }}><span style={{ fontFamily: "Bebas", fontSize: 52, lineHeight: 1, color: "#ffffff", letterSpacing: ".04em", textShadow: "0 4px 16px rgba(0,0,0,.72)" }}>ISCRIVITI SU MOVI APP</span><span style={{ marginTop: 10, color: cyan, fontSize: 19, fontWeight: 600, letterSpacing: ".06em" }}>Scansiona il QR</span></div>
        <div style={{ width: 138, height: 138, padding: 8, display: "flex", alignItems: "center", justifyContent: "center", background: "#ffffff", borderRadius: 5 }}><img src={qrImage} alt="QR iscrizione torneo" width={122} height={122} /></div>
      </div>
    </div>
  );
}
