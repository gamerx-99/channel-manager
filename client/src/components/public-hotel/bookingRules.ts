import { calculateServiceTotal } from "@shared/pricingModels";

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

// Uses the shared pricing function so the guest sees the same total the server charges.
export function serviceLineTotal(service: BookingServiceLike, qty: number, nights: number): number {
  return calculateServiceTotal(
    {
      service_name: service.name,
      pricing_model: service.pricingModel as "PER_PERSON_PER_NIGHT" | "PER_NIGHT" | "ONE_TIME",
      unit_price: Number(service.unitPrice),
      quantity: qty,
    },
    nights,
  );
}

export function selectedServicesTotal(
  services: Array<BookingServiceLike & { id: string }>,
  selectedQty: Record<string, number>,
  nights: number,
): number {
  return services.reduce((sum, service) => sum + serviceLineTotal(service, selectedQty[service.id] ?? 0, nights), 0);
}
