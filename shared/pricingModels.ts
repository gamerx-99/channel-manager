export type PricingModel = 'PER_PERSON_PER_NIGHT' | 'PER_NIGHT' | 'ONE_TIME';

export interface BookingServiceInput {
  service_name: string;
  pricing_model: PricingModel;
  unit_price: number;
  quantity: number;
}

export function calculateServiceTotal(
  service: BookingServiceInput,
  numberOfNights: number,
): number {
  switch (service.pricing_model) {
    case 'PER_PERSON_PER_NIGHT':
      return service.unit_price * service.quantity * numberOfNights;
    case 'PER_NIGHT':
      return service.unit_price * service.quantity * numberOfNights;
    case 'ONE_TIME':
      return service.unit_price * service.quantity;
    default:
      return 0;
  }
}

export function calculateGrandTotal(
  roomBasePrice: number,
  numberOfNights: number,
  services: BookingServiceInput[]
): number {
  const roomTotal = roomBasePrice * numberOfNights;
  const servicesTotal = services.reduce((sum, s) => sum + calculateServiceTotal(s, numberOfNights), 0);
  return roomTotal + servicesTotal;
}

export function calcNights(checkInIso: string, checkOutIso: string): number {
  const a = Date.parse(`${checkInIso}T00:00:00.000Z`);
  const b = Date.parse(`${checkOutIso}T00:00:00.000Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return Math.round((b - a) / 86_400_000);
}
