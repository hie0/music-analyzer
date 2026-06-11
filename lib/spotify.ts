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
