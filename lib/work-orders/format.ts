const formatter = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
});

/** Formats an ISO timestamp in UTC. Deterministic, so server and client output match. */
export function formatTimestamp(iso: string): string {
  return formatter.format(new Date(iso));
}
