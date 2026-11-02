/** Formats a YYYY-MM-DD date as DD/MM/YYYY without local timezone shifts. */
export function formatDateDDMMYYYY(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}
