import { post } from './http'
import { settingsConfig } from '../config/settings'

export interface LlmConnectionTestInput {
  api_key: string
  base_url: string
  model: string
}

export interface LlmConnectionTestResult {
  ok: boolean
  latencyMs: number
  model?: string
}

export function testLlmConnection(input: LlmConnectionTestInput): Promise<LlmConnectionTestResult> {
  return post<LlmConnectionTestResult, LlmConnectionTestInput>(`${settingsConfig.endpoint}/llm/test`, input)
}
