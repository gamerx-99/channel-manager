type Translate = (key: 'publicHotel.confirmedNights' | 'publicHotel.confirmedNightsPlural', params: { count: number }) => string;

/** "1 night" / "2 nights". The dictionary text already holds the number. */
export function nightsLabel(t: Translate, count: number) {
  return count > 1 ? t('publicHotel.confirmedNightsPlural', { count }) : t('publicHotel.confirmedNights', { count });
}
