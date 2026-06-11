import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(request: Request) {
  try {
    const { topArtists, topTracks, metrics } = await request.json();

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `
      사용자의 음악 취향 데이터:
      - 선호 아티스트: ${topArtists.join(', ')}
      - 자주 듣는 곡: ${topTracks.join(', ')}
      - 취향 지표: ${JSON.stringify(metrics)}

      이 취향에 어울리는 '새로운' 곡 10개를 추천해줘. 
      이미 듣는 아티스트는 제외하고, 비슷한 분위기의 다른 아티스트 곡으로 추천해줘.
      **중요: title은 번역하지 말고 Spotify에 등록된 원곡 제목 그대로(영어, 일본어 등) 표기해줘.**
      반드시 아래 JSON 배열 형식으로만 응답해 (마크다운 펜스, 설명 없이 순수 JSON 데이터만):
      [{ "title": "곡 제목", "artist": "아티스트명", "reason": "추천 이유 한 문장" }]
    `;

    let result;
    let lastError;
    const maxRetries = 3;

    for (let i = 0; i < maxRetries; i++) {
      try {
        result = await model.generateContent(prompt);
        break; // Success!
      } catch (err) {
        lastError = err;
        console.warn(`Gemini attempt ${i + 1} failed:`, err);
        if (i < maxRetries - 1) {
          // Wait 2s, 4s before retrying
          await sleep(Math.pow(2, i + 1) * 1000);
        }
      }
    }

    if (!result) {
      console.error('All Gemini attempts failed:', lastError);
      return NextResponse.json(
        { error: 'AI 추천 서버가 혼잡합니다. 잠시 후 다시 시도해주세요.' },
        { status: 503 }
      );
    }

    const response = await result.response;
    let text = response.text();

    // Remove markdown code blocks if present
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();

    let recommendations = [];
    try {
      recommendations = JSON.parse(text);
    } catch (parseError) {
      console.error('Gemini JSON parse error:', parseError);
      console.log('Raw text was:', text);
      recommendations = [];
    }

    return NextResponse.json({ recommendations });
  } catch (error: any) {
    console.error('Recommendation API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
