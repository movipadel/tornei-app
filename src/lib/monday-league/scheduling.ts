export type WeeklyRoundDate = {
  roundId: string;
  roundNumber: number;
  playDate: string;
};

export function isIsoMonday(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && date.getUTCDay() === 1;
}

export function generateWeeklyMondayDates(
  rounds: Array<{ id: string; round_number: number }>,
  firstMonday: string
): WeeklyRoundDate[] {
  if (!isIsoMonday(firstMonday)) throw new Error("La prima data deve essere un lunedì");
  const first = new Date(`${firstMonday}T12:00:00Z`);
  return [...rounds]
    .sort((left, right) => left.round_number - right.round_number)
    .map((round, index) => {
      const date = new Date(first);
      date.setUTCDate(first.getUTCDate() + index * 7);
      return { roundId: round.id, roundNumber: round.round_number, playDate: date.toISOString().slice(0, 10) };
    });
}
