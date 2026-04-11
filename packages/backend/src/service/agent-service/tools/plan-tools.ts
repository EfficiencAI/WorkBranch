import type { ToolDefinition, ToolResult } from './registry';
import { toolRegistry } from './registry';
import { toolExecutor } from './executors';
import { logger } from '../../../core/logging';

export interface PlanStep {
  id: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  tool?: string;
  args?: Record<string, unknown>;
  result?: string;
}

export interface PlanConfig {
  max_steps: number;
  require_approval: boolean;
  auto_execute: boolean;
}

const DEFAULT_PLAN_CONFIG: PlanConfig = {
  max_steps: 5,
  require_approval: true,
  auto_execute: false,
};

let currentPlanConfig: PlanConfig = { ...DEFAULT_PLAN_CONFIG };

async function executeEnterPlanMode(args: Record<string, unknown>): Promise<ToolResult> {
  const taskDescription = args.task_description as string;
  const maxSteps = (args.max_steps as number) || DEFAULT_PLAN_CONFIG.max_steps;
  const requireApproval = args.require_approval !== false;
  const autoExecute = args.auto_execute === true;

  currentPlanConfig = {
    max_steps: maxSteps,
    require_approval: requireApproval,
    auto_execute: autoExecute,
  };

  toolExecutor.setCurrentMode('plan');

  const result = {
    mode: 'plan',
    task_description: taskDescription,
    config: currentPlanConfig,
    message: '已进入规划模式。请使用 update_plan 工具添加任务步骤。',
  };

  logger.info({
    event: 'plan.mode.entered',
    task_description: taskDescription,
    config: currentPlanConfig,
  });

  return { result: JSON.stringify(result, null, 2), error: null };
}

async function executeExitPlanMode(_args: Record<string, unknown>): Promise<ToolResult> {
  const currentMode = toolExecutor.getCurrentMode();

  if (currentMode !== 'plan') {
    return {
      result: JSON.stringify({ mode: 'normal', message: '当前不在规划模式中' }),
      error: null,
    };
  }

  const currentPlan = toolExecutor.getCurrentPlan();
  toolExecutor.setCurrentMode('normal');

  const result = {
    mode: 'normal',
    message: '已退出规划模式',
    plan_status: currentPlan.length > 0 ? '已保存' : '无计划',
    steps_count: currentPlan.length,
  };

  logger.info({
    event: 'plan.mode.exited',
    steps_count: currentPlan.length,
  });

  return { result: JSON.stringify(result, null, 2), error: null };
}

async function executeUpdatePlan(args: Record<string, unknown>): Promise<ToolResult> {
  const currentMode = toolExecutor.getCurrentMode();

  if (currentMode !== 'plan') {
    return {
      result: null,
      error: '当前不在规划模式中，请先使用 enter_plan_mode 进入规划模式',
    };
  }

  const tasks = args.tasks as Array<{
    description: string;
    tool?: string;
    args?: Record<string, unknown>;
  }>;

  if (!tasks || !Array.isArray(tasks)) {
    return { result: null, error: '缺少 tasks 参数或格式不正确' };
  }

  if (tasks.length > currentPlanConfig.max_steps) {
    return {
      result: null,
      error: `任务步骤数量超过限制（最大 ${currentPlanConfig.max_steps} 步）`,
    };
  }

  const plan: PlanStep[] = tasks.map((task, index) => ({
    id: `step_${index + 1}`,
    description: task.description,
    status: 'pending' as const,
    tool: task.tool,
    args: task.args,
  }));

  toolExecutor.setPlan(plan);

  const result = {
    message: '计划已更新',
    plan: plan.map((step) => ({
      id: step.id,
      description: step.description,
      status: step.status,
    })),
    config: currentPlanConfig,
  };

  logger.info({
    event: 'plan.updated',
    steps_count: plan.length,
  });

  return { result: JSON.stringify(result, null, 2), error: null };
}

async function executeExecutePlan(args: Record<string, unknown>): Promise<ToolResult> {
  const currentMode = toolExecutor.getCurrentMode();

  if (currentMode !== 'plan') {
    return {
      result: null,
      error: '当前不在规划模式中，请先使用 enter_plan_mode 进入规划模式',
    };
  }

  const currentPlan = toolExecutor.getCurrentPlan();

  if (currentPlan.length === 0) {
    return {
      result: null,
      error: '当前没有计划，请先使用 update_plan 添加任务步骤',
    };
  }

  if (currentPlanConfig.require_approval) {
    const confirmed = args.confirm === true;
    if (!confirmed) {
      const result = {
        message: '计划执行需要确认',
        require_approval: true,
        plan: currentPlan.map((step, index) => ({
          step_index: index + 1,
          description: step.description,
          tool: step.tool,
        })),
        instruction: '请设置 confirm=true 参数来确认执行计划',
      };
      return { result: JSON.stringify(result, null, 2), error: null };
    }
  }

  const result = {
    message: '计划已提交执行',
    plan: currentPlan.map((step, index) => ({
      step_index: index + 1,
      description: step.description,
      tool: step.tool,
      args: step.args,
    })),
    config: currentPlanConfig,
    instruction: '计划将由编排器按顺序执行',
  };

  logger.info({
    event: 'plan.submitted',
    steps_count: currentPlan.length,
  });

  return { result: JSON.stringify(result, null, 2), error: null };
}

export function registerPlanTools(): void {
  const tools: ToolDefinition[] = [
    {
      name: 'enter_plan_mode',
      description: '进入规划模式，用于复杂任务的多步骤规划。当任务需要多个步骤、涉及多个文件修改、或需要仔细设计时使用。',
      params: 'task_description, max_steps, require_approval, auto_execute',
      category: 'mode',
      executor: executeEnterPlanMode,
    },
    {
      name: 'exit_plan_mode',
      description: '退出规划模式，返回正常执行模式。',
      params: '',
      category: 'mode',
      executor: executeExitPlanMode,
    },
    {
      name: 'update_plan',
      description: '更新当前规划，添加、修改或删除任务步骤。',
      params: 'tasks (array of {description, tool?, args?})',
      category: 'plan',
      executor: executeUpdatePlan,
    },
    {
      name: 'execute_plan',
      description: '执行当前规划的所有任务。',
      params: 'confirm (boolean, required if require_approval=true)',
      category: 'plan',
      executor: executeExecutePlan,
    },
  ];

  for (const tool of tools) {
    toolRegistry.register(tool);
  }

  logger.info({
    event: 'tools.registered',
    category: 'plan',
    count: tools.length,
  });
}
