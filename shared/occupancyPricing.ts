export type ExtraGuestMode = 'per_person' | 'tiered_percent';
export type ChildPriceMode = 'free' | 'fixed' | 'percent';

export type OccupancyPricingRules = {
  base_occupancy: number;
  max_occupancy: number;
  extra_guest_mode: ExtraGuestMode;
  extra_guest_amount: number | string;
  extra_guest_tier_percents: Array<number | string>;
  child_price_mode: ChildPriceMode;
  child_price_value: number | string;
  children_count_toward_max: boolean;
};

export type ChildMeasurement = { age: number } | { height_cm: number };

export function classifyGuests(
  children: ChildMeasurement[],
  rule: { child_rule: 'age' | 'height'; child_rule_limit: number | null },
) {
  const qualifyingChildren = children.filter(child =>
    rule.child_rule_limit != null && (rule.child_rule === 'age'
      ? 'age' in child && child.age <= rule.child_rule_limit
      : 'height_cm' in child && child.height_cm <= rule.child_rule_limit),
  ).length;
  return {
    qualifyingChildren,
    adultEquivalentCount: children.length - qualifyingChildren,
  };
}

export function fitsOccupancy(
  rules: Pick<OccupancyPricingRules, 'base_occupancy' | 'max_occupancy' | 'children_count_toward_max'>,
  adults: number,
  qualifyingChildren: number,
  adultEquivalentChildren: number,
): boolean {
  const guestsCounted = adults + adultEquivalentChildren + (rules.children_count_toward_max ? qualifyingChildren : 0);
  return guestsCounted <= rules.max_occupancy && adults + adultEquivalentChildren >= 1;
}

export function calculateOccupancyPrice(input: {
  nightlyRate: number;
  rules: OccupancyPricingRules;
  adults: number;
  qualifyingChildren: number;
}): number {
  const { nightlyRate, rules, adults, qualifyingChildren } = input;
  const extraGuests = Math.max(0, adults - rules.base_occupancy);
  let extraGuestPrice = 0;
  if (rules.extra_guest_mode === 'per_person') {
    extraGuestPrice = extraGuests * Number(rules.extra_guest_amount);
  } else {
    extraGuestPrice = Array.from({ length: extraGuests }, (_, index) =>
      nightlyRate * (Number(rules.extra_guest_tier_percents[index] ?? 0) / 100),
    ).reduce((sum, value) => sum + value, 0);
  }
  const childPrice = rules.child_price_mode === 'fixed'
    ? qualifyingChildren * Number(rules.child_price_value)
    : rules.child_price_mode === 'percent'
      ? qualifyingChildren * nightlyRate * (Number(rules.child_price_value) / 100)
      : 0;
  return Math.round((nightlyRate + extraGuestPrice + childPrice) * 100) / 100;
}

export function calculateStayOccupancyPrice(input: {
  nightlyRates: number[];
  rules: OccupancyPricingRules;
  adults: number;
  qualifyingChildren: number;
}) {
  const nightlyPrices = input.nightlyRates.map(nightlyRate => calculateOccupancyPrice({
    ...input,
    nightlyRate,
  }));
  return {
    nightlyPrices,
    totalPrice: nightlyPrices.reduce((sum, nightlyPrice) => sum + nightlyPrice, 0),
  };
}
