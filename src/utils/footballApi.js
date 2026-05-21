const API_BASE = 'https://api.football-data.org/v4';
const API_KEY = import.meta.env.VITE_FOOTBALL_DATA_API_KEY;

async function apiFetch(path) {
  if (!API_KEY) {
    throw new Error('football-data.org API key is missing');
  }

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: { 'X-Auth-Token': API_KEY },
    });
  } catch (err) {
    throw new Error(`football-data.org request failed: ${err.message}`);
  }

  const requestsLeft = Number(res.headers.get('x-requests-available-minute'));
  const resetIn = res.headers.get('x-requestcounter-reset');
  if (Number.isFinite(requestsLeft) && requestsLeft <= 2) {
    console.warn(`football-data.org throttle: ${requestsLeft} requests left this minute; reset in ${resetIn || '?'}s`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const detail = body ? `: ${body.slice(0, 180)}` : '';
    throw new Error(`football-data.org ${res.status}${detail}`);
  }
  return res.json();
}

export async function getWorldCupMatches(matchday) {
  const params = matchday ? `?matchday=${matchday}` : '';
  return apiFetch(`/competitions/WC/matches${params}`);
}

export async function getCompetitionMatches(code, { dateFrom, dateTo, status } = {}) {
  const params = new URLSearchParams();
  if (dateFrom) params.set('dateFrom', dateFrom);
  if (dateTo) params.set('dateTo', dateTo);
  if (status) params.set('status', status);
  const query = params.toString();
  return apiFetch(`/competitions/${code}/matches${query ? `?${query}` : ''}`);
}

export async function getTodayMatches() {
  const today = new Date().toISOString().slice(0, 10);
  return apiFetch(`/competitions/WC/matches?dateFrom=${today}&dateTo=${today}`);
}

export function mapApiStatus(status) {
  switch (status) {
    case 'SCHEDULED':
    case 'TIMED':
      return 'upcoming';
    case 'IN_PLAY':
    case 'PAUSED':
      return 'live';
    case 'FINISHED':
      return 'finished';
    default:
      return 'upcoming';
  }
}

export function extractScore(apiMatch) {
  const ft = apiMatch.score?.fullTime;
  if (!ft) return null;
  return { home: ft.home, away: ft.away };
}
