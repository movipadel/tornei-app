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

type PosterVariant = "baraonda" | "fixed_pairs" | "padelseries";

function getClubLabel(club: string) {
  return (club || "")
    .replace(/^MOVI CLUB\s+/i, "")
    .replace(/^MOVI PADEL CLUB\s+/i, "")
    .trim();
}

function renderStandardPoster(params: {
  background: string;
  data: PosterData;
  variant: "baraonda" | "fixed_pairs";
}) {
  const { background, data, variant } = params;

  const clubLabel = getClubLabel(data.club);

  const isLongCategory =
    data.category === "FEMMINILE" || data.category === "MASCHILE";

  const levelAccentColor = variant === "fixed_pairs" ? "#7dff2b" : "#18c8ff";
  const timeAndParticipantsAccentColor =
    variant === "fixed_pairs" ? "#7dff2b" : "#b92cff";

  const dateAndClubAccentColor = "#11c8ff";

  const CATEGORY_TOP = 64;
  const CATEGORY_LEFT = 166;
  const CATEGORY_WIDTH = 460;
  const CATEGORY_FONT_LONG = 75;
  const CATEGORY_FONT_SHORT = 86;

  const LEVEL_TOP = 168;
  const LEVEL_LEFT = 83;
  const LEVEL_WIDTH = 350;
  const LEVEL_FONT = 28;

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

function renderPadelSeriesPoster(params: {
  background: string;
  data: PosterData;
}) {
  const { background, data } = params;

  const clubLabel = getClubLabel(data.club);
  const category = String(data.category ?? "").trim().toUpperCase();

  // Area generale del pannello basso
  const PANEL_LEFT = 92;
  const PANEL_TOP = 930;
  const PANEL_WIDTH = 900;
  const PANEL_HEIGHT = 150;
  const COL_WIDTH = 225;

  // Posizione base di ogni colonna
  const DATE_COL_LEFT = 0;
  const TIME_COL_LEFT = COL_WIDTH;
  const CLUB_COL_LEFT = COL_WIDTH * 2;
  const MAX_COL_LEFT = COL_WIDTH * 3;

  const isFemaleLayout = category === "FEMMINILE";

  // TUNING GIÀ CORRETTO: Maschile + Misto
  const baseTuning = {
    DATE_X: -45,
    DATE_Y: 30,

    TIME_X: -28,
    TIME_Y: 12,

    CLUB_X: 0,
    CLUB_Y: 40,

    MAX_X: 25,
    MAX_Y: 45,

    DATE_DAYNAME_SIZE: 20,
    DATE_NUMBER_SIZE: 68,
    DATE_MONTH_SIZE: 20,

    TIME_SIZE: 58,
    CLUB_SIZE: 25,
    MAX_SIZE: 60,
  };

  // TUNING FEMMINILE: da regolare separatamente
  const femaleTuning = {
    DATE_X: -60,
    DATE_Y: 60,

    TIME_X: -35,
    TIME_Y: 45,

    CLUB_X: 0,
    CLUB_Y: 75,

    MAX_X: 35,
    MAX_Y: 75,

    DATE_DAYNAME_SIZE: 20,
    DATE_NUMBER_SIZE: 68,
    DATE_MONTH_SIZE: 20,

    TIME_SIZE: 58,
    CLUB_SIZE: 25,
    MAX_SIZE: 60,
  };

  const tuning = isFemaleLayout ? femaleTuning : baseTuning;

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
      <div
        style={{
          position: "absolute",
          left: PANEL_LEFT,
          top: PANEL_TOP,
          width: PANEL_WIDTH,
          height: PANEL_HEIGHT,
          display: "flex",
        }}
      >
        {/* DATA */}
        <div
          style={{
            position: "absolute",
            left: DATE_COL_LEFT + tuning.DATE_X,
            top: tuning.DATE_Y,
            width: COL_WIDTH,
            height: PANEL_HEIGHT,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontFamily: "Inter",
              fontSize: tuning.DATE_DAYNAME_SIZE,
              fontWeight: 700,
              color: "#ffffff",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              lineHeight: 1,
              marginBottom: 4,
            }}
          >
            {data.dateDayName}
          </div>

          <div
            style={{
              fontFamily: "Bebas",
              fontSize: tuning.DATE_NUMBER_SIZE,
              color: "#ffffff",
              letterSpacing: "-0.02em",
              lineHeight: 1,
            }}
          >
            {data.dateDayNumber}
          </div>

          <div
            style={{
              marginTop: 2,
              fontFamily: "Inter",
              fontSize: tuning.DATE_MONTH_SIZE,
              fontWeight: 700,
              color: "#ffffff",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              lineHeight: 1,
            }}
          >
            {data.dateMonth}
          </div>
        </div>

        {/* ORA */}
        <div
          style={{
            position: "absolute",
            left: TIME_COL_LEFT + tuning.TIME_X,
            top: tuning.TIME_Y,
            width: COL_WIDTH,
            height: PANEL_HEIGHT,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            fontFamily: "Bebas",
            fontSize: tuning.TIME_SIZE,
            color: "#ffffff",
            letterSpacing: "-0.03em",
            lineHeight: 1,
          }}
        >
          {data.time}
        </div>

        {/* CLUB */}
        <div
          style={{
            position: "absolute",
            left: CLUB_COL_LEFT + tuning.CLUB_X,
            top: tuning.CLUB_Y,
            width: COL_WIDTH,
            height: PANEL_HEIGHT,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            paddingLeft: 12,
            paddingRight: 12,
            fontFamily: "Inter",
            fontSize: tuning.CLUB_SIZE,
            fontWeight: 800,
            color: "#ffffff",
            textTransform: "uppercase",
            letterSpacing: "0.02em",
            lineHeight: 1,
          }}
        >
          {clubLabel}
        </div>

        {/* MAX */}
        <div
          style={{
            position: "absolute",
            left: MAX_COL_LEFT + tuning.MAX_X,
            top: tuning.MAX_Y,
            width: COL_WIDTH,
            height: PANEL_HEIGHT,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            fontFamily: "Bebas",
            fontSize: tuning.MAX_SIZE,
            color: "#ffffff",
            letterSpacing: "-0.02em",
            lineHeight: 1,
          }}
        >
          {data.participantsMain}
        </div>
      </div>
    </div>
  );
}

export function TournamentPoster({
  background,
  data,
  variant = "baraonda",
}: {
  background: string;
  data: PosterData;
  variant?: PosterVariant;
}) {
  if (variant === "padelseries") {
    return renderPadelSeriesPoster({
      background,
      data,
    });
  }

  return renderStandardPoster({
    background,
    data,
    variant,
  });
}