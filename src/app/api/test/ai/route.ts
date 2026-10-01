/**
 * GET /api/test/ai
 * Role required: super_admin (enforced in Sprint 06 — auth not yet built)
 * Tests GeminiKeyManager rotation and generation with a simple prompt.
 * Remove or restrict this endpoint before production deployment.
 */

import { getAIProvider } from '@/lib/ai/ai-provider.factory'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const ai = getAIProvider()

    const result = await ai.generate(
      'Reci "Pozdrav iz IDSS Handbook sistema!" na bosanskom jeziku. Odgovori samo tom rečenicom.',
      'Ti si IDSS Asistent. Odgovaraš isključivo na bosanskom jeziku.',
      { maxTokens: 512, temperature: 0.3, language: 'bs' }
    )

    return NextResponse.json({
      success: true,
      data: {
        text: result.text,
        tokensUsed: result.tokensUsed,
        keyIndexUsed: result.keyIndexUsed,
        modelString: result.modelString,
      },
    })

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[/api/test/ai] Error:', message)

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
