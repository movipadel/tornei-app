export function getTournamentPosterData(tournament: any) {
  const category = tournament.category?.toUpperCase() || "";
  const level = tournament.level?.toUpperCase() || "";

  const dateParts = formatDateParts(tournament.date);
  const time = formatTime(tournament.time);

  const club = tournament.club_name?.toUpperCase() || "";

  const participants = formatParticipants(
    tournament.max_participants,
    category
  );

  return {
    category,
    level,
    dateDayName: dateParts.dayName,
    dateDayNumber: dateParts.dayNumber,
    dateMonth: dateParts.month,
    dateYear: dateParts.year,
    time,
    club,
    participantsMain: participants.main,
    participantsSub: participants.sub,
  };
}

function formatDateParts(dateStr: string) {
  if (!dateStr) {
    return {
      dayName: "",
      dayNumber: "",
      month: "",
      year: "",
    };
  }

  const date = new Date(dateStr);

  const days = [
    "DOMENICA",
    "LUNEDÌ",
    "MARTEDÌ",
    "MERCOLEDÌ",
    "GIOVEDÌ",
    "VENERDÌ",
    "SABATO",
  ];

  const months = [
    "GENNAIO",
    "FEBBRAIO",
    "MARZO",
    "APRILE",
    "MAGGIO",
    "GIUGNO",
    "LUGLIO",
    "AGOSTO",
    "SETTEMBRE",
    "OTTOBRE",
    "NOVEMBRE",
    "DICEMBRE",
  ];

  return {
    dayName: days[date.getDay()],
    dayNumber: String(date.getDate()),
    month: months[date.getMonth()],
    year: String(date.getFullYear()),
  };
}

function formatTime(timeStr: string) {
  if (!timeStr) return "";
  return timeStr.slice(0, 5);
}

function formatParticipants(max: number, category: string) {
  if (!max) {
    return {
      main: "",
      sub: "",
    };
  }

  if (category === "MISTO") {
    const half = Math.floor(max / 2);
    return {
      main: String(max),
      sub: `(${half}+${half})`,
    };
  }

  return {
    main: String(max),
    sub: "",
  };
}