const DAY_MS = 24 * 60 * 60 * 1000;

/** The owner can change their mind during this wait; the service ends when it runs out. */
export const CLOSURE_WAIT_DAYS = 7;
/** Terms 7.3: the hotel can export its data for this long after the service ends. */
export const CLOSURE_EXPORT_DAYS = 30;
/** DPA 7.1 promises deletion within 60 days, so the job starts a day early and can retry. */
export const CLOSURE_PURGE_DAYS = 59;

/** Everything is worked out from the request time, so no job has to move a hotel between states. */
export function closureTimeline(requestedAt: Date) {
  const serviceEndsAt = new Date(requestedAt.getTime() + CLOSURE_WAIT_DAYS * DAY_MS);
  return {
    serviceEndsAt,
    exportEndsAt: new Date(serviceEndsAt.getTime() + CLOSURE_EXPORT_DAYS * DAY_MS),
    purgeAt: new Date(serviceEndsAt.getTime() + CLOSURE_PURGE_DAYS * DAY_MS),
  };
}

/** Latest request time whose service has ended by `now`. */
export const serviceEndedCutoff = (now: Date) => new Date(now.getTime() - CLOSURE_WAIT_DAYS * DAY_MS);

/** Latest request time whose data is due for deletion by `now`. */
export const purgeCutoff = (now: Date) => new Date(now.getTime() - (CLOSURE_WAIT_DAYS + CLOSURE_PURGE_DAYS) * DAY_MS);
