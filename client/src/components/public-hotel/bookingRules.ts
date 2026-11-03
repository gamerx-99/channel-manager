export interface BookingServiceLike {
  id?: string;
  name: string;
  pricingModel: string;
  unitPrice: number | string;
}

export function isDatesValid(checkIn: string | null, checkOut: string | null): boolean {
  return Boolean(checkIn && checkOut && checkOut > checkIn);
}

export function areGuestsValid(adults: number, children: string[]): boolean {
  return (
    adults >= 1 &&
    children.every((value) => value !== "" && Number.isFinite(Number(value)) && Number(value) >= 0)
  );
}

export function countNights(checkIn: string, checkOut: string): number {
  if (!checkIn || !checkOut) return 0;
  const start = new Date(`${checkIn}T00:00:00`).getTime();
  const end = new Date(`${checkOut}T00:00:00`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  const diff = end - start;
  if (diff <= 0) return 0;
  return Math.round(diff / (24 * 60 * 60 * 1000));
}

export function parseChildMeasurements(
  children: string[],
  rule: string,
): Array<{ age: number } | { height_cm: number }> {
  return children
    .filter((value) => value !== "")
    .map((value) =>
      rule === "age" ? { age: Number(value) } : { height_cm: Number(value) },
    );
}

export function isChildWithinLimit(value: string, rule: string, limit?: number | null): boolean {
  if (value === "") return false;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return false;
  const max = limit ?? (rule === "age" ? 17 : 250);
  return number <= max;
}

export function serviceLineTotal(service: BookingServiceLike, qty: number, nights: number): number {
  const pricingModel = service.pricingModel as "PER_PERSON_PER_NIGHT" | "PER_NIGHT" | "ONE_TIME";
  const unitPrice = Number(service.unitPrice);
  switch (pricingModel) {
    case "PER_PERSON_PER_NIGHT":
    case "PER_NIGHT":
      return unitPrice * qty * nights;
    case "ONE_TIME":
      return unitPrice * qty;
    default:
      return 0;
  }
}

export function selectedServicesTotal(
  services: Array<BookingServiceLike & { id: string }>,
  selectedQty: Record<string, number>,
  nights: number,
): number {
  return services.reduce((sum, service) => sum + serviceLineTotal(service, selectedQty[service.id] ?? 0, nights), 0);
}