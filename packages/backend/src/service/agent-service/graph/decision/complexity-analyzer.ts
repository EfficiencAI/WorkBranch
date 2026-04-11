export enum ExecutionMode {
  DIRECT = 'direct',
  PLAN = 'plan',
  SUBAGENT = 'subagent',
}

export interface ComplexityAnalysis {
  mode: ExecutionMode;
  reason: string;
  suggested_tools: string[];
  suggested_agent: string | null;
}

export interface IntentAnalysis {
  intent_type: string;
  summary: string;
  key_points: string[];
  suggested_tools: string[];
  complexity: string;
  confidence: number;
}

export function evaluateTaskComplexity(userMessage: string): string {
  const messageLength = userMessage.length;

  const simpleKeywords = [
    '读取',
    '查看',
    '检查',
    '查询',
    '获取',
    '显示',
    '列出',
    'read',
    'view',
    'check',
    'query',
    'get',
    'show',
    'list',
  ];

  const complexKeywords = [
    '实现',
    '开发',
    '创建',
    '修改',
    '重构',
    '优化',
    '修复',
    'implement',
    'develop',
    'create',
    'modify',
    'refactor',
    'optimize',
    'fix',
  ];

  const lowerMessage = userMessage.toLowerCase();

  for (const keyword of simpleKeywords) {
    if (lowerMessage.includes(keyword)) {
      return 'simple';
    }
  }

  for (const keyword of complexKeywords) {
    if (lowerMessage.includes(keyword)) {
      return 'complex';
    }
  }

  if (messageLength < 50) {
    return 'simple';
  } else if (messageLength > 200) {
    return 'complex';
  } else {
    return 'medium';
  }
}

export function analyzeTaskComplexity(
  _userMessage: string,
  intentAnalysis: IntentAnalysis
): ComplexityAnalysis {
  const complexity = intentAnalysis.complexity || 'medium';
  const intentType = intentAnalysis.intent_type || 'other';
  const suggestedTools = intentAnalysis.suggested_tools || [];

  if (complexity === 'simple') {
    return {
      mode: ExecutionMode.DIRECT,
      reason: '简单任务，直接执行',
      suggested_tools: suggestedTools,
      suggested_agent: null,
    };
  }

  if (intentType === 'explore') {
    return {
      mode: ExecutionMode.SUBAGENT,
      reason: '探索任务，委托给 Explore Agent',
      suggested_tools: [],
      suggested_agent: 'explore',
    };
  }

  if (intentType === 'review') {
    return {
      mode: ExecutionMode.SUBAGENT,
      reason: '审查任务，委托给 Review Agent',
      suggested_tools: [],
      suggested_agent: 'review',
    };
  }

  if (complexity === 'complex' && ['develop', 'refactor', 'debug'].includes(intentType)) {
    return {
      mode: ExecutionMode.PLAN,
      reason: '复杂开发任务，建议进入规划模式',
      suggested_tools: ['enter_plan_mode'],
      suggested_agent: null,
    };
  }

  return {
    mode: ExecutionMode.DIRECT,
    reason: '中等复杂度，Agent 自主决策是否需要规划',
    suggested_tools: suggestedTools,
    suggested_agent: null,
  };
}
