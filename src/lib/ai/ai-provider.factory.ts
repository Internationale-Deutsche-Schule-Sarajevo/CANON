/**
 * AI Provider Factory
 * Returns the correct AIProvider implementation based on AI_PROVIDER env var.
 * To swap providers: add new implementation, update this factory, zero other changes.
 */

import type { AIProvider } from './ai-provider.interface'
import { GeminiProvider } from './providers/gemini-provider'
import { env } from '@/lib/env'

let providerInstance: AIProvider | null = null

/**
 * Returns singleton AIProvider instance.
 * Always use this — never instantiate providers directly in business logic.
 */
export function getAIProvider(): AIProvider {
  if (providerInstance) return providerInstance

  switch (env.AI_PROVIDER) {
    case 'gemini':
      providerInstance = new GeminiProvider()
      console.log('[AIProvider] Using provider: Gemini (gemini-2.5-flash)')
      break
    default:
      throw new Error(
        `[AIProvider] Unknown AI_PROVIDER: "${env.AI_PROVIDER}". ` +
        `Supported values: "gemini"`
      )
  }

  return providerInstance
}
