import React from "react";

type PosterData = {
  category: string;
  level: string;
  dateDayName: string;
  dateDayNumber: string;
  dateMonth: string;
  dateYear: string;
  time: string;
  club: string;
  participantsMain: string;
  participantsSub: string;
};

type PosterVariant = "baraonda" | "fixed_pairs";

export function TournamentPoster({
  background,
  data,
  variant = "baraonda",
}: {
  background: string;
  data: PosterData;
  variant?: PosterVariant;
}) {
  const clubLabel = (data.club || "")
    .replace(/^MOVI CLUB\s+/i, "")
    .replace(/^MOVI PADEL CLUB\s+/i, "")
    .trim();

  const isLongCategory =
    data.category === "FEMMINILE" || data.category === "MASCHILE";

  // Colori
  const levelAccentColor = variant === "fixed_pairs" ? "#7dff2b" : "#18c8ff";
  const timeAndParticipantsAccentColor =
    variant === "fixed_pairs" ? "#7dff2b" : "#b92cff";

  // Data e club restano sempre blu/cyan
  const dateAndClubAccentColor = "#11c8ff";

  /*
   * =========================================================
   * CATEGORIA (separata dal livello)
   * =========================================================
   */
  const CATEGORY_TOP = 64;
  const CATEGORY_LEFT = 166;
  const CATEGORY_WIDTH = 460;
  const CATEGORY_FONT_LONG = 75;
  const CATEGORY_FONT_SHORT = 86;

  /*
   * =========================================================
   * LIVELLO (INDIPENDENTE)
   * =========================================================
   */
  const LEVEL_TOP = 168;
  const LEVEL_LEFT = 83;
  const LEVEL_WIDTH = 350;
  const LEVEL_FONT = 28;

  /*
   * =========================================================
   * PANNELLO BASSO
   * =========================================================
   */
  const PANEL_TOP = 910;
  const PANEL_LEFT = 86;

  const DATE_LEFT = 24;
  const DATE_TOP = 22;

  const TIME_LEFT = 262;
  const TIME_TOP = 24;

  const CLUB_LEFT = 480;
  const CLUB_TOP = 85;
  const CLUB_WIDTH = 185;
  const CLUB_FONT = 25;

  const PARTICIPANTS_LEFT = 754;
  const PARTICIPANTS_TOP = 22;
  const PARTICIPANTS_WIDTH = 122;

  return (
    <div
      style={{
        width: 1080,
        height: 1350,
        display: "flex",
        position: "relative",
        flexDirection: "column",
        fontFamily: "Inter",
        color: "#ffffff",
        overflow: "hidden",
        backgroundImage: `url(${background})`,
        backgroundSize: "1080px 1350px",
        backgroundPosition: "top left",
        backgroundRepeat: "no-repeat",
      }}
    >
      {/* ======================================================
          CATEGORIA
         ====================================================== */}
      <div
        style={{
          position: "absolute",
          top: CATEGORY_TOP,
          left: CATEGORY_LEFT,
          width: CATEGORY_WIDTH,
          display: "flex",
          alignItems: "center",
          height: 74,
        }}
      >
        <div
          style={{
            display: "flex",
            fontFamily: "Bebas",
            fontSize: isLongCategory
              ? CATEGORY_FONT_LONG
              : CATEGORY_FONT_SHORT,
            fontWeight: 400,
            lineHeight: 1,
            textTransform: "uppercase",
            color: "#ffffff",
            letterSpacing: isLongCategory ? "0.04em" : "0.05em",
          }}
        >
          {data.category}
        </div>
      </div>

      {/* ======================================================
          LIVELLO
         ====================================================== */}
      <div
        style={{
          position: "absolute",
          top: LEVEL_TOP,
          left: LEVEL_LEFT,
          width: LEVEL_WIDTH,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: 26,
        }}
      >
        <div
          style={{
            display: "flex",
            fontFamily: "Inter",
            fontSize: LEVEL_FONT,
            fontWeight: 600,
            lineHeight: 1,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: levelAccentColor,
          }}
        >
          {data.level}
        </div>
      </div>

      {/* ======================================================
          PANNELLO BASSO
         ====================================================== */}
      <div
        style={{
          position: "absolute",
          left: PANEL_LEFT,
          top: PANEL_TOP,
          width: 912,
          height: 150,
          display: "flex",
        }}
      >
        {/* DATA */}
        <div
          style={{
            position: "absolute",
            left: DATE_LEFT,
            top: DATE_TOP,
            width: 150,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              fontFamily: "Inter",
              fontSize: 18,
              fontWeight: 600,
              lineHeight: 1,
              textTransform: "uppercase",
              color: "#ffffff",
              letterSpacing: "0.04em",
            }}
          >
            {data.dateDayName}
          </div>

          <div
            style={{
              display: "flex",
              marginTop: 4,
              fontFamily: "Bebas",
              fontSize: 64,
              fontWeight: 400,
              lineHeight: 1,
              color: dateAndClubAccentColor,
              letterSpacing: "-0.02em",
            }}
          >
            {data.dateDayNumber}
          </div>

          <div
            style={{
              display: "flex",
              marginTop: 0,
              fontFamily: "Inter",
              fontSize: 21,
              fontWeight: 600,
              lineHeight: 1,
              textTransform: "uppercase",
              color: "#ffffff",
              letterSpacing: "0.03em",
            }}
          >
            {data.dateMonth}
          </div>

          <div
            style={{
              display: "flex",
              marginTop: 4,
              fontFamily: "Inter",
              fontSize: 20,
              fontWeight: 600,
              lineHeight: 1,
              color: dateAndClubAccentColor,
              letterSpacing: "0.05em",
            }}
          >
            {data.dateYear}
          </div>
        </div>

        {/* ORA */}
        <div
          style={{
            position: "absolute",
            left: TIME_LEFT,
            top: TIME_TOP,
            width: 140,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 19,
              fontWeight: 700,
              lineHeight: 1,
              textTransform: "uppercase",
              color: "#ffffff",
            }}
          />

          <div
            style={{
              display: "flex",
              marginTop: 10,
              fontFamily: "Bebas",
              fontSize: 64,
              fontWeight: 400,
              lineHeight: 1,
              color: timeAndParticipantsAccentColor,
              letterSpacing: "-0.03em",
            }}
          >
            {data.time}
          </div>
        </div>

        {/* CLUB */}
        <div
          style={{
            position: "absolute",
            left: CLUB_LEFT,
            top: CLUB_TOP,
            width: CLUB_WIDTH,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              fontFamily: "Inter",
              fontSize: CLUB_FONT,
              fontWeight: 700,
              lineHeight: 0.95,
              textTransform: "uppercase",
              color: dateAndClubAccentColor,
              letterSpacing: "0.02em",
            }}
          >
            {clubLabel}
          </div>
        </div>

        {/* PARTECIPANTI */}
        <div
          style={{
            position: "absolute",
            left: PARTICIPANTS_LEFT,
            top: PARTICIPANTS_TOP,
            width: PARTICIPANTS_WIDTH,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
          }}
        >
          {/* MAX */}
          <div
            style={{
              display: "flex",
              fontFamily: "Inter",
              fontSize: 17,
              fontWeight: 600,
              lineHeight: 1,
              textTransform: "uppercase",
              color: "#ffffff",
              letterSpacing: "0.12em",
            }}
          >
            MAX
          </div>

          {/* NUMERO */}
          <div
            style={{
              display: "flex",
              marginTop: 4,
              fontFamily: "Bebas",
              fontSize: 66,
              fontWeight: 400,
              lineHeight: 1,
              color: timeAndParticipantsAccentColor,
              letterSpacing: "-0.02em",
            }}
          >
            {data.participantsMain}
          </div>

          {/* SUB eventuale, es. (10+10) */}
          <div
            style={{
              display: "flex",
              marginTop: 4,
              fontFamily: "Inter",
              fontSize: 25,
              fontWeight: 600,
              lineHeight: 1,
              color: timeAndParticipantsAccentColor,
              letterSpacing: "0.01em",
            }}
          >
            {data.participantsSub}
          </div>
        </div>
      </div>
    </div>
  );
}