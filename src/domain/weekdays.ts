// Monday first, as Czech calendars show it; `day` follows Date#getDay().
export const weekDays = [
  { day: 1, short: 'Po', long: 'pondělí' }, { day: 2, short: 'Út', long: 'úterý' }, { day: 3, short: 'St', long: 'středa' },
  { day: 4, short: 'Čt', long: 'čtvrtek' }, { day: 5, short: 'Pá', long: 'pátek' }, { day: 6, short: 'So', long: 'sobota' },
  { day: 0, short: 'Ne', long: 'neděle' },
] as const;

export const everyDay = [0, 1, 2, 3, 4, 5, 6];

export function daysLabel(days: number[]): string {
  if (days.length === 7) return 'Každý den';
  return weekDays.filter((item) => days.includes(item.day)).map((item) => item.long).join(', ');
}
