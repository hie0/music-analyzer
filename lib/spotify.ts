const CLIENT_ID = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID;
const REDIRECT_URI = process.env.NEXT_PUBLIC_REDIRECT_URI || 'http://127.0.0.1:3000/callback';

export async function redirectToAuthCodeFlow() {
  const verifier = generateCodeVerifier(128);
  const challenge = await generateCodeChallenge(verifier);

  localStorage.setItem('spotify_code_verifier', verifier);

  const params = new URLSearchParams();
  params.append('client_id', CLIENT_ID!);
  params.append('response_type', 'code');
  params.append('redirect_uri', REDIRECT_URI);
  params.append('scope', 'user-top-read user-read-private user-read-email');
  params.append('code_challenge_method', 'S256');
  params.append('show_dialog', 'true');
  params.append('code_challenge', challenge);

  document.location = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

function generateCodeVerifier(length: number) {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

async function generateCodeChallenge(codeVerifier: string) {
  const data = new TextEncoder().encode(codeVerifier);
  const digest = await window.crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode.apply(null, [...new Uint8Array(digest)]))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

let tokenFetching = false;

export async function getAccessToken(code: string): Promise<string> {
  if (tokenFetching) {
    console.log('Already fetching token, skipping...');
    return '';
  }
  tokenFetching = true;

  const verifier = localStorage.getItem('spotify_code_verifier');

  const params = new URLSearchParams();
  params.append('client_id', CLIENT_ID!);
  params.append('grant_type', 'authorization_code');
  params.append('code', code);
  params.append('redirect_uri', REDIRECT_URI);
  params.append('code_verifier', verifier!);

  const result = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });

  const text = await result.text();
  console.log('Token response:', text);
  const { access_token } = JSON.parse(text);
  return access_token;
}

export async function getTopTracks(token: string) {
  const result = await fetch('https://api.spotify.com/v1/me/top/tracks?limit=50&time_range=medium_term', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  const text = await result.text();
  console.log('Top tracks response status:', result.status);
  console.log('Top tracks response:', text.substring(0, 200));
  return JSON.parse(text);
}

export type TasteMetrics = {
  recency: number;
  retro: number;
  concentration: number;
  albumDiversity: number;
  longTracks: number;
  fullAlbum: number;
};

export function computeTasteMetrics(tracks: any[] = []): TasteMetrics {
  const empty: TasteMetrics = {
    recency: 0,
    retro: 0,
    concentration: 0,
    albumDiversity: 0,
    longTracks: 0,
    fullAlbum: 0,
  };

  if (!tracks || tracks.length === 0) {
    return empty;
  }

  const trackCount = tracks.length;
  const currentYear = new Date().getFullYear();

  // release_date에서 연도만 안전하게 추출 (없거나 형식이 이상하면 null)
  const years = tracks.map((t) => {
    const raw = t.album?.release_date;
    if (!raw || typeof raw !== 'string') return null;
    const year = parseInt(raw.slice(0, 4), 10);
    return Number.isFinite(year) ? year : null;
  });

  // recency: 최근 3년 내 발매 곡 비율 (전체 곡 수로 나눠 비율 왜곡 방지)
  const recentCount = years.filter((y) => y !== null && y >= currentYear - 3).length;
  const recency = (recentCount / trackCount) * 100;

  // retro: 발매 10년 이상 된 곡 비율
  const retroCount = years.filter((y) => y !== null && y <= currentYear - 10).length;
  const retro = (retroCount / trackCount) * 100;

  // concentration: 최다 등장 아티스트 id의 등장 횟수 / 전체 곡 수
  const artistCounts: Record<string, number> = {};
  tracks.forEach((t) => {
    (t.artists || []).forEach((a: any) => {
      if (a?.id) artistCounts[a.id] = (artistCounts[a.id] || 0) + 1;
    });
  });
  const maxArtistCount = Math.max(...Object.values(artistCounts), 0);
  const concentration = (maxArtistCount / trackCount) * 100;

  // albumDiversity: 고유 album.name 개수 / 곡 수
  const uniqueAlbums = new Set(
    tracks.map((t) => t.album?.name).filter((n) => !!n)
  ).size;
  const albumDiversity = (uniqueAlbums / trackCount) * 100;

  // longTracks: duration_ms 평균을 4분(240000ms)=100 기준으로 스케일, 8분 이상은 100 캡
  const avgDuration =
    tracks.reduce((acc, t) => acc + (t.duration_ms || 0), 0) / trackCount;
  const longTracks = Math.min((avgDuration / 240000) * 100, 100);

  // fullAlbum: album_type이 'album'인 곡 비율
  const albumTypeCount = tracks.filter(
    (t) => t.album?.album_type === 'album'
  ).length;
  const fullAlbum = (albumTypeCount / trackCount) * 100;

  return {
    recency: Math.round(recency),
    retro: Math.round(retro),
    concentration: Math.round(concentration),
    albumDiversity: Math.round(albumDiversity),
    longTracks: Math.round(longTracks),
    fullAlbum: Math.round(fullAlbum),
  };
}

export function computeTrackStats(tracks: any[] = []) {
  if (!tracks || tracks.length === 0) {
    return {
      hours: 0,
      minutes: 0,
      uniqueArtists: 0,
      uniqueAlbums: 0,
      trackCount: 0,
    };
  }

  let totalDurationMs = 0;
  const artistIds = new Set<string>();
  const albumIds = new Set<string>();

  tracks.forEach((track) => {
    totalDurationMs += track.duration_ms || 0;

    if (track.artists) {
      track.artists.forEach((artist: any) => {
        if (artist?.id) artistIds.add(artist.id);
      });
    }

    const albumId = track.album?.id || track.album?.name;
    if (albumId) {
      albumIds.add(albumId);
    }
  });

  const totalMinutes = Math.round(totalDurationMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return {
    hours,
    minutes,
    uniqueArtists: artistIds.size,
    uniqueAlbums: albumIds.size,
    trackCount: tracks.length,
  };
}

export async function searchTrack(token: string, title: string, artist: string) {
  try {
    const q = encodeURIComponent(`${title} ${artist}`);
    const url = `https://api.spotify.com/v1/search?q=${q}&type=track&limit=3`;

    const result = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!result.ok) return null;

    const data = await result.json();
    const track = data.tracks?.items?.[0];

    if (!track) return null;

    return {
      id: track.id,
      name: track.name,
      artist: track.artists?.[0]?.name,
      albumImage: track.album?.images?.[0]?.url || null,
      spotifyUrl: track.external_urls?.spotify,
      uri: track.uri,
    };
  } catch (err) {
    console.error('searchTrack error:', err);
    return null;
  }
}

export async function searchArtistTracks(token: string, artistName: string) {
  try {
    const q = encodeURIComponent(artistName);
    const url = `https://api.spotify.com/v1/search?q=${q}&type=track&limit=10`;

    const result = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!result.ok) return [];

    const data = await result.json();
    const items = data.tracks?.items || [];

    // Filter tracks to ensure the artistName matches one of the track's artists
    const lowerArtistName = artistName.toLowerCase();
    let filtered = items.filter((track: any) =>
      track.artists?.some((a: any) => a.name?.toLowerCase().includes(lowerArtistName))
    );

    // Fallback to original items if filtering results in an empty list
    if (filtered.length === 0) {
      filtered = items;
    }

    return filtered.map((track: any) => ({
      id: track.id,
      name: track.name,
      albumImage: track.album?.images?.[0]?.url || null,
      spotifyUrl: track.external_urls?.spotify,
      albumName: track.album?.name,
    }));
  } catch (err) {
    console.error('searchArtistTracks error:', err);
    return [];
  }
}
