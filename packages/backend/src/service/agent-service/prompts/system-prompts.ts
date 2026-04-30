import {
  GENERAL_PURPOSE_PROMPT,
  EXPLORE_AGENT_PROMPT,
  PLAN_AGENT_PROMPT,
  REVIEW_AGENT_PROMPT,
} from './agent-prompts';

export const AGENT_PROMPTS: Record<string, string> = {
  'general-purpose': GENERAL_PURPOSE_PROMPT,
  explore: EXPLORE_AGENT_PROMPT,
  plan: PLAN_AGENT_PROMPT,
  review: REVIEW_AGENT_PROMPT,
};

export function getAgentPrompt(agentType: string): string {
  return AGENT_PROMPTS[agentType] ?? GENERAL_PURPOSE_PROMPT;
}

export interface PromptContext {
  cwd?: string;
  projectStructure?: string;
}

export function enhancePromptWithContext(
  prompt: string,
  context: PromptContext
): string {
  let enhancedPrompt = prompt;

  if (context.cwd) {
    enhancedPrompt += `\n\n当前工作目录: ${context.cwd}`;
  }

  if (context.projectStructure) {
    enhancedPrompt += `\n\n项目结构:\n${context.projectStructure}`;
  }

  return enhancedPrompt;
}
