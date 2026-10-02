/**
 * Parses a human-written cook time such as "40 minutes" or
 * "1 hour 15 minutes (includes marinating)" into total minutes.
 * Notes in parentheses are ignored. Returns null if no duration is found.
 */
export function parseCookTimeMinutes(text: string): number | null {
  const withoutNotes = text.replace(/\(.*?\)/g, '').toLowerCase();
  const hours = withoutNotes.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/);
  const minutes = withoutNotes.match(/(\d+)\s*(?:minutes?|mins?)\b/);

  if (!hours && !minutes) return null;

  const total = (hours ? parseFloat(hours[1]) * 60 : 0) + (minutes ? parseInt(minutes[1], 10) : 0);
  return Math.round(total);
}
