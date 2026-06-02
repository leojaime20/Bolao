/**
 * Generate ICS calendar content for one or more events.
 * On mobile, the OS will open the native calendar app automatically.
 */

function formatDate(date, kickoff, offsetHours = -1) {
  const [year, month, day] = date.split('-').map(Number);
  const [hours, minutes] = kickoff.split(':').map(Number);
  // kickoff is BST (UTC+1), convert to UTC
  const d = new Date(Date.UTC(year, month - 1, day, hours + offsetHours, minutes));
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function buildEvent({ title, date, kickoff, duration = 120 }) {
  const uid = `Copa-Yantai-${date}-${kickoff.replace(':', '')}@copa2026`;
  const dtStart = formatDate(date, kickoff, -1);
  const end = new Date(
    Date.UTC(
      ...date.split('-').map((v, i) => (i === 1 ? +v - 1 : +v)),
      ...kickoff.split(':').map(Number)
    )
  );
  end.setUTCHours(end.getUTCHours() - 1 + Math.floor(duration / 60));
  end.setUTCMinutes(end.getUTCMinutes() + (duration % 60));
  const dtEnd = end.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  return [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${title}`,
    'DESCRIPTION:FIFA World Cup 2026',
    'STATUS:CONFIRMED',
    'BEGIN:VALARM',
    'TRIGGER:-PT30M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Match starting in 30 minutes',
    'END:VALARM',
    'END:VEVENT',
  ].join('\r\n');
}

function triggerDownload(icsContent, filename) {
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Download a single match as .ics
 */
export function downloadICS({ title, date, kickoff, duration = 120 }) {
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Copa 2026//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    buildEvent({ title, date, kickoff, duration }),
    'END:VCALENDAR',
  ].join('\r\n');

  triggerDownload(ics, `${title.replace(/\s+/g, '_')}.ics`);
}

/**
 * Download multiple matches as a single .ics file
 * @param {Array} matches - Array of { title, date, kickoff, duration }
 * @param {string} filename - Output filename
 */
export function downloadMultipleICS(matches, filename = 'Copa_2026.ics') {
  const events = matches.map((m) => buildEvent(m)).join('\r\n');

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Copa 2026//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    events,
    'END:VCALENDAR',
  ].join('\r\n');

  triggerDownload(ics, filename);
}
