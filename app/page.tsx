'use client';

import { useEffect, useState, useCallback } from 'react';
import Image from 'next/image';
import { redirectToAuthCodeFlow, getTopTracks, computeTasteMetrics, computeTrackStats, searchTrack, searchArtistTracks } from '@/lib/spotify';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from 'recharts';

type SpotifyTrack = {
  id: string;
  name: string;
  artists: { name: string }[];
  album: {
    name: string;
    images: { url: string }[];
  };
};

type ArtistData = {
  name: string;
  count: number;
};

type RadarPoint = {
  axis: string;
  value: number;
};

type Recommendation = {
  title: string;
  artist: string;
  reason: string;
  albumImage?: string | null;
  spotifyUrl?: string;
  found?: boolean;
};

const AXIS_LABELS: Record<string, string> = {
  recency: '최신성',
  retro: '레트로',
  concentration: '집중도',
  albumDiversity: '앨범 다양성',
  longTracks: '대곡 취향',
  fullAlbum: '정규앨범',
};

export default function Home() {
  const [token, setToken] = useState<string | null>(null);
  const [tracks, setTracks] = useState<SpotifyTrack[]>([]);
  const [artistData, setArtistData] = useState<ArtistData[]>([]);
  const [radarData, setRadarData] = useState<RadarPoint[]>([]);
  const [stats, setStats] = useState<{
    hours: number;
    minutes: number;
    uniqueArtists: number;
    uniqueAlbums: number;
    trackCount: number;
  } | null>(null);
  
  // Recommendation states
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [recLoading, setRecLoading] = useState(false);
  const [recError, setRecError] = useState<string | null>(null);

  // Artist tracks modal states
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null);
  const [artistTracks, setArtistTracks] = useState<{ id: string; name: string; albumImage: string | null; spotifyUrl: string; albumName: string }[]>([]);
  const [artistLoading, setArtistLoading] = useState(false);

  const [loading, setLoading] = useState(true);

  const logout = () => {
    localStorage.clear();
    window.location.reload();
  };

  const getRecommendations = async () => {
    if (tracks.length === 0 || !token) return;
    
    setRecLoading(true);
    setRecError(null);
    
    try {
      const topTracks = tracks.slice(0, 20).map(t => t.name);
      
      const artistNamesMap: Record<string, boolean> = {};
      const uniqueArtistNames: string[] = [];
      tracks.forEach(track => {
        track.artists.forEach(artist => {
          if (!artistNamesMap[artist.name]) {
            artistNamesMap[artist.name] = true;
            uniqueArtistNames.push(artist.name);
          }
        });
      });
      const topArtists = uniqueArtistNames.slice(0, 10);
      
      const metrics = computeTasteMetrics(tracks);
      
      const response = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topArtists, topTracks, metrics }),
      });
      
      const data = await response.json();
      
      if (data.error) {
        setRecError(data.error);
      } else if (data.recommendations) {
        // Enrich recommendations with Spotify data
        const accessToken = localStorage.getItem('spotify_access_token') || '';
        const enriched = await Promise.all(
          data.recommendations.map(async (rec: { title: string; artist: string; reason: string }) => {
            const found = await searchTrack(accessToken, rec.title, rec.artist);
            return found
              ? { 
                  ...rec, 
                  albumImage: found.albumImage, 
                  spotifyUrl: found.spotifyUrl, 
                  found: true 
                }
              : { ...rec, found: false };
          })
        );
        console.log('enriched recommendations:', enriched);
        setRecommendations(enriched);
      }
    } catch (err) {
      console.error('Failed to get recommendations:', err);
      setRecError('추천 정보를 가져오는 중 오류가 발생했습니다.');
    } finally {
      setRecLoading(false);
    }
  };

  const handleArtistClick = async (artistName: string) => {
    setSelectedArtist(artistName);
    setArtistLoading(true);
    setArtistTracks([]);
    try {
      const accessToken = localStorage.getItem('spotify_access_token') || '';
      const tracks = await searchArtistTracks(accessToken, artistName);
      setArtistTracks(tracks);
    } catch (err) {
      console.error('Failed to fetch artist tracks:', err);
    } finally {
      setArtistLoading(false);
    }
  };

  const fetchData = useCallback(async (accessToken: string) => {
    try {
      const data = await getTopTracks(accessToken);
      if (data.items) {
        setTracks(data.items);

        // Aggregate artists
        const counts: Record<string, number> = {};
        data.items.forEach((track: SpotifyTrack) => {
          track.artists.forEach((artist) => {
            counts[artist.name] = (counts[artist.name] || 0) + 1;
          });
        });

        const formattedData = Object.entries(counts)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10); // Top 10 artists

        setArtistData(formattedData);

        // Taste metrics -> radar data
        const metrics = computeTasteMetrics(data.items);
        const radarPoints: RadarPoint[] = Object.entries(metrics).map(
          ([key, value]) => ({
            axis: AXIS_LABELS[key] || key,
            value: value as number,
          })
        );
        setRadarData(radarPoints);

        // Track stats
        const trackStats = computeTrackStats(data.items);
        setStats(trackStats);
      } else if (data.error) {
        // Token might be invalid
        logout();
      }
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      const storedToken = localStorage.getItem('spotify_access_token');
      if (storedToken) {
        setToken(storedToken);
        await fetchData(storedToken);
      } else {
        setLoading(false);
      }
    };
    init();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white font-sans">
        <div className="text-xl animate-pulse text-green-500 font-bold">Loading Your Taste...</div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-black text-white p-4 font-sans">
        <div className="mb-12 text-center">
          <h1 className="mb-4 text-6xl font-extrabold tracking-tighter text-white">
            Music <span className="text-green-500">Analyzer</span>
          </h1>
          <p className="text-zinc-400 text-lg">Discover your Spotify listening habits</p>
        </div>
        <button
          onClick={redirectToAuthCodeFlow}
          className="group relative flex items-center justify-center gap-3 overflow-hidden rounded-full bg-green-500 px-10 py-5 text-xl font-bold text-black transition-all hover:scale-105 active:scale-95"
        >
          <span>Login with Spotify</span>
          <div className="absolute inset-0 bg-white/20 transition-transform translate-x-full group-hover:translate-x-0" />
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-green-500/30">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-800 bg-black/80 p-6 backdrop-blur-md">
        <h1 className="text-2xl font-bold tracking-tighter text-green-500">Music Analyzer</h1>
        <button
          onClick={logout}
          className="rounded-full border border-zinc-700 px-6 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-white"
        >
          Logout
        </button>
      </header>

      <main className="mx-auto max-w-6xl p-6 py-12">
        {stats && (
          <section className="mb-16">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <div className="rounded-2xl bg-zinc-900/50 p-6 border border-zinc-800/50 shadow-xl">
                <div className="text-sm text-zinc-400 mb-2">Top 50 총 재생 시간</div>
                <div className="text-3xl font-bold text-green-500">
                  {stats.hours}
                  <span className="text-lg text-zinc-400 font-medium ml-1">시간</span>
                  <span className="ml-2">{stats.minutes}</span>
                  <span className="text-lg text-zinc-400 font-medium ml-1">분</span>
                </div>
              </div>
              <div className="rounded-2xl bg-zinc-900/50 p-6 border border-zinc-800/50 shadow-xl">
                <div className="text-sm text-zinc-400 mb-2">고유 아티스트</div>
                <div className="text-3xl font-bold text-green-500">
                  {stats.uniqueArtists}
                  <span className="text-lg text-zinc-400 font-medium ml-1">명</span>
                </div>
              </div>
              <div className="rounded-2xl bg-zinc-900/50 p-6 border border-zinc-800/50 shadow-xl">
                <div className="text-sm text-zinc-400 mb-2">고유 앨범</div>
                <div className="text-3xl font-bold text-green-500">
                  {stats.uniqueAlbums}
                  <span className="text-lg text-zinc-400 font-medium ml-1">개</span>
                </div>
              </div>
              <div className="rounded-2xl bg-zinc-900/50 p-6 border border-zinc-800/50 shadow-xl">
                <div className="text-sm text-zinc-400 mb-2">분석한 곡</div>
                <div className="text-3xl font-bold text-green-500">
                  {stats.trackCount}
                  <span className="text-lg text-zinc-400 font-medium ml-1">곡</span>
                </div>
              </div>
            </div>
          </section>
        )}

        <section className="mb-16">
          <div className="mb-8">
            <h2 className="text-3xl font-bold tracking-tight">Your Taste Profile</h2>
            <p className="text-zinc-400">6가지 지표로 본 당신의 청취 성향</p>
          </div>

          <div className="h-[450px] w-full rounded-2xl bg-zinc-900/50 p-6 border border-zinc-800/50 shadow-2xl">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} outerRadius="75%">
                <PolarGrid stroke="#333" />
                <PolarAngleAxis
                  dataKey="axis"
                  tick={{ fill: '#ccc', fontSize: 13 }}
                />
                <PolarRadiusAxis
                  angle={90}
                  domain={[0, 100]}
                  tick={{ fill: '#555', fontSize: 10 }}
                  stroke="#333"
                />
                <Radar
                  name="Taste"
                  dataKey="value"
                  stroke="#22c55e"
                  fill="#22c55e"
                  fillOpacity={0.5}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#18181b',
                    border: '1px solid #333',
                    borderRadius: '12px',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)',
                  }}
                  itemStyle={{ color: '#22c55e', fontWeight: 'bold' }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* AI Recommendations Section */}
        <section className="mb-16">
          <div className="mb-8 flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">AI 추천 플레이리스트</h2>
              <p className="text-zinc-400">당신의 취향을 분석해 새로운 곡을 찾아드려요</p>
            </div>
            <button
              onClick={getRecommendations}
              disabled={recLoading}
              className="rounded-full bg-green-500 px-8 py-3 font-bold text-black transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
            >
              {recLoading ? '분석 중...' : '추천 받기'}
            </button>
          </div>

          {recError && (
            <div className="mb-8 rounded-xl border border-red-500/50 bg-red-500/10 p-4 text-red-500">
              {recError}
            </div>
          )}

          {recommendations.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {recommendations.map((rec, index) => {
                const CardContent = (
                  <div className={`flex h-full gap-4 rounded-xl border border-zinc-800/50 bg-zinc-900/40 p-5 transition-all hover:bg-zinc-800/60 hover:border-green-500/50 ${rec.spotifyUrl ? 'cursor-pointer' : ''}`}>
                    <div className="relative h-16 w-16 shrink-0 shadow-lg">
                      {rec.albumImage ? (
                        <Image
                          src={rec.albumImage}
                          alt={rec.title}
                          fill
                          sizes="64px"
                          className="rounded-lg object-cover"
                        />
                      ) : (
                        <div className="h-full w-full rounded-lg bg-zinc-800 flex items-center justify-center text-xs text-zinc-500">No Image</div>
                      )}
                    </div>
                    <div className="overflow-hidden flex-1">
                      <div className="font-bold text-white text-lg mb-0.5 truncate">{rec.title}</div>
                      <div className="text-sm font-medium text-green-500 mb-2 truncate">{rec.artist}</div>
                      <div className="text-xs text-zinc-400 leading-tight line-clamp-2 italic mb-2">
                        "{rec.reason}"
                      </div>
                      {!rec.found && <div className="text-[10px] text-zinc-600 font-medium">Spotify에서 찾을 수 없음</div>}
                    </div>
                  </div>
                );

                return rec.spotifyUrl ? (
                  <a key={index} href={rec.spotifyUrl} target="_blank" rel="noopener noreferrer" className="block">
                    {CardContent}
                  </a>
                ) : (
                  <div key={index}>{CardContent}</div>
                );
              })}
            </div>
          )}
        </section>

        <section className="mb-16">
          <div className="mb-8">
            <h2 className="text-3xl font-bold tracking-tight">Top Artists</h2>
            <p className="text-zinc-400">Frequency in your top 50 tracks (medium term)</p>
          </div>

          <div className="h-[450px] w-full rounded-2xl bg-zinc-900/50 p-6 border border-zinc-800/50 shadow-2xl">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={artistData} layout="vertical" margin={{ left: 30, right: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" horizontal={false} />
                <XAxis type="number" stroke="#555" />
                <YAxis dataKey="name" type="category" stroke="#ccc" width={100} tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#18181b',
                    border: '1px solid #333',
                    borderRadius: '12px',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)'
                  }}
                  itemStyle={{ color: '#22c55e', fontWeight: 'bold' }}
                  cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
                />
                <Bar 
                  dataKey="count" 
                  fill="#22c55e" 
                  radius={[0, 6, 6, 0]} 
                  barSize={32}
                  style={{ cursor: 'pointer' }}
                  onClick={(data) => handleArtistClick(data.name)}
                >
                  {artistData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={`rgba(34, 197, 94, ${1 - index * 0.08})`}
                      className="transition-all duration-300"
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section>
          <div className="mb-8">
            <h2 className="text-3xl font-bold tracking-tight">Top Tracks</h2>
            <p className="text-zinc-400">Your most played songs recently</p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tracks.map((track, idx) => (
              <div
                key={track.id}
                className="group flex items-center gap-4 rounded-xl bg-zinc-900/40 p-4 transition-all hover:bg-zinc-800/60 border border-zinc-800/50 hover:border-zinc-700"
              >
                <div className="flex-none text-zinc-600 font-mono text-sm w-4">{idx + 1}</div>
                <div className="relative h-16 w-16 shrink-0 shadow-xl transition-transform group-hover:scale-105">
                  {track.album.images[0]?.url ? (
                    <Image
                      src={track.album.images[0].url}
                      alt={track.name}
                      fill
                      sizes="64px"
                      className="rounded-lg object-cover"
                    />
                  ) : (
                    <div className="h-full w-full rounded-lg bg-zinc-800" />
                  )}
                </div>
                <div className="overflow-hidden">
                  <div className="truncate font-bold text-white group-hover:text-green-500 transition-colors">
                    {track.name}
                  </div>
                  <div className="truncate text-sm text-zinc-400">
                    {track.artists.map((a) => a.name).join(', ')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="mt-20 border-t border-zinc-900 p-12 text-center text-zinc-500 text-sm">
        <p>© 2026 Music Analyzer. Powered by Spotify API.</p>
      </footer>

      {/* Artist Tracks Modal */}
      {selectedArtist && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-300"
          onClick={() => setSelectedArtist(null)}
        >
          <div 
            className="relative w-full max-w-2xl max-h-[80vh] overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-800 p-6">
              <h3 className="text-2xl font-bold text-white">{selectedArtist}의 곡</h3>
              <button 
                onClick={() => setSelectedArtist(null)}
                className="rounded-full p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-2">
              {artistLoading ? (
                <div className="flex h-32 items-center justify-center text-zinc-400 animate-pulse">
                  곡을 불러오는 중...
                </div>
              ) : artistTracks.length > 0 ? (
                artistTracks.map((track) => (
                  <a 
                    key={track.id} 
                    href={track.spotifyUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-4 rounded-xl p-3 transition-all hover:bg-zinc-800 group"
                  >
                    <div className="relative h-12 w-12 shrink-0">
                      {track.albumImage ? (
                        <Image
                          src={track.albumImage}
                          alt={track.name}
                          fill
                          sizes="48px"
                          className="rounded object-cover"
                        />
                      ) : (
                        <div className="h-full w-full rounded bg-zinc-800" />
                      )}
                    </div>
                    <div className="overflow-hidden">
                      <div className="truncate font-bold text-white group-hover:text-green-500 transition-colors">
                        {track.name}
                      </div>
                      <div className="truncate text-sm text-zinc-400">
                        {track.albumName}
                      </div>
                    </div>
                  </a>
                ))
              ) : (
                <div className="py-12 text-center text-zinc-500">
                  곡을 찾을 수 없습니다.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
