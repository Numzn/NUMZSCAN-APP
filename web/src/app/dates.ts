// Event dates are calendar days (YYYY-MM-DD) with no time zone, so they are formatted in UTC to keep the day fixed.
const DAY_MONTH = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const DAY_MONTH_YEAR = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function calendarDay(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
}

// "10 Dec – 17 Dec 2026", or "30 Dec 2026 – 3 Jan 2027" across a year end. A single day is shown once.
export function formatEventDates(startsOn: string, endsOn: string): string {
  const start = calendarDay(startsOn);
  const end = calendarDay(endsOn);
  if (!start || !end) return `${startsOn} to ${endsOn}`;
  if (startsOn === endsOn) return DAY_MONTH_YEAR.format(start);
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  return `${(sameYear ? DAY_MONTH : DAY_MONTH_YEAR).format(start)} – ${DAY_MONTH_YEAR.format(end)}`;
}
