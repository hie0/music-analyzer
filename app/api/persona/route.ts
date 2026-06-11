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

      이 사람의 음악 취향을 하나의 캐릭터/페르소나로 정의해줘.
      반드시 아래 JSON 형식으로만 응답해 (마크다운 펜스, 설명 없이 순수 JSON 데이터만):
      {
        "title": "페르소나 이름 (예: 심야의 인디 탐험가)",
        "emoji": "어울리는 이모지 1개",
        "description": "이 사람의 음악 취향을 2~3문장으로 위트있게 묘사",
        "keywords": ["키워드1", "키워드2", "키워드3"]
      }
      * description은 한국어로, 친근하고 재미있는 톤으로 작성해줘.
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
        console.warn(`Gemini Persona attempt ${i + 1} failed:`, err);
        if (i < maxRetries - 1) {
          await sleep(Math.pow(2, i + 1) * 1000);
        }
      }
    }

    if (!result) {
      console.error('All Gemini Persona attempts failed:', lastError);
      return NextResponse.json(
        { title: '음악 애호가', emoji: '🎵', description: '취향을 분석하는 중 잠시 오류가 발생했지만, 분명 멋진 취향을 가지셨을 거예요!', keywords: ['음악감상', '취향분석중'] }
      );
    }

    const response = await result.response;
    let text = response.text();

    text = text.replace(/```json/g, '').replace(/```/g, '').trim();

    let persona;
    try {
      persona = JSON.parse(text);
    } catch (parseError) {
      console.error('Gemini Persona JSON parse error:', parseError);
      persona = {
        title: '음악 애호가',
        emoji: '🎵',
        description: '다양한 장르를 즐기는 진정한 음악 애호가입니다.',
        keywords: ['멜로디', '리듬', '취향'],
      };
    }

    return NextResponse.json(persona);
  } catch (error: any) {
    console.error('Persona API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
