'use client';

import { useEffect, useRef } from 'react';
import { getAccessToken } from '@/lib/spotify';

export default function Callback() {
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');

    if (code) {
      getAccessToken(code).then((token) => {
        console.log('token:', token);
        if (token) {
          localStorage.setItem('spotify_access_token', token);
          window.location.href = window.location.origin;
        }
      }).catch((err) => {
        console.error('Error:', err);
      });
    }
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-black text-white">
      <div className="text-xl">Logging in with Spotify...</div>
    </div>
  );
}