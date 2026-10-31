/**
 * Stands in for a deleted person in retained hotel records. One fixed value, so nothing left
 * in a row links back to them, and not null, because a null actor means an automatic change
 * in booking_status_log and "System" on a message.
 */
export const DELETED_USER_ID = "deleted-user";
