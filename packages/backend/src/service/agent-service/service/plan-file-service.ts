import * as fs from 'fs';
import * as path from 'path';
import { workspaceService } from './workspace-service';
import { logger } from '../../../core/logging';
import type { Task } from '../state/agent-state';

export interface PlanCreateResult {
  success: boolean;
  plan_file?: string;
  error?: string;
}

export interface PlanReadResult {
  success: boolean;
  content?: string;
  plan_file?: string;
  error?: string;
}

class PlanFileServiceImpl {
  private getWorkspaceDir(workspaceId: string): string | null {
    return workspaceService.getWorkspaceDir(workspaceId);
  }

  formatPlanAsMarkdown(userMessage: string, tasks: Task[]): string {
    const lines = [
      '# 执行计划',
      '',
      '## 用户需求',
      userMessage,
      '',
      '## 执行步骤',
      '',
    ];

    for (const task of tasks) {
      lines.push(`### ${task.id}. ${task.description}`);
      if (task.goal) {
        lines.push(`**目标**: ${task.goal}`);
      }
      if (task.done_when) {
        lines.push(`**完成条件**: ${task.done_when}`);
      }
      lines.push(`**阶段**: ${task.phase}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  createPlan(
    workspaceId: string,
    planContent: string,
    planSteps: Task[],
    metadata?: Record<string, unknown>
  ): PlanCreateResult {
    const workspaceDir = this.getWorkspaceDir(workspaceId);
    if (!workspaceDir) {
      return { success: false, error: `工作区不存在: ${workspaceId}` };
    }

    const planFilePath = path.join(workspaceDir, 'plan.md');

    try {
      fs.writeFileSync(planFilePath, planContent, 'utf-8');

      logger.info({
        event: 'plan_file.created',
        workspace_id: workspaceId,
        plan_file: planFilePath,
        steps_count: planSteps.length,
        metadata,
      });

      return { success: true, plan_file: planFilePath };
    } catch (err) {
      const error = String(err);
      logger.error({
        event: 'plan_file.create_failed',
        workspace_id: workspaceId,
        error,
      });
      return { success: false, error };
    }
  }

  readPlan(workspaceId: string): PlanReadResult {
    const workspaceDir = this.getWorkspaceDir(workspaceId);
    if (!workspaceDir) {
      return { success: false, error: `工作区不存在: ${workspaceId}` };
    }

    const planFilePath = path.join(workspaceDir, 'plan.md');

    if (!fs.existsSync(planFilePath)) {
      return { success: false, error: 'plan.md 文件不存在' };
    }

    try {
      const content = fs.readFileSync(planFilePath, 'utf-8');

      logger.info({
        event: 'plan_file.read',
        workspace_id: workspaceId,
        content_length: content.length,
      });

      return { success: true, content, plan_file: planFilePath };
    } catch (err) {
      const error = String(err);
      logger.error({
        event: 'plan_file.read_failed',
        workspace_id: workspaceId,
        error,
      });
      return { success: false, error };
    }
  }

  deletePlan(workspaceId: string): { success: boolean; error?: string } {
    const workspaceDir = this.getWorkspaceDir(workspaceId);
    if (!workspaceDir) {
      return { success: false, error: `工作区不存在: ${workspaceId}` };
    }

    const planFilePath = path.join(workspaceDir, 'plan.md');

    if (!fs.existsSync(planFilePath)) {
      return { success: true };
    }

    try {
      fs.unlinkSync(planFilePath);
      logger.info({
        event: 'plan_file.deleted',
        workspace_id: workspaceId,
      });
      return { success: true };
    } catch (err) {
      const error = String(err);
      logger.error({
        event: 'plan_file.delete_failed',
        workspace_id: workspaceId,
        error,
      });
      return { success: false, error };
    }
  }

  planExists(workspaceId: string): boolean {
    const workspaceDir = this.getWorkspaceDir(workspaceId);
    if (!workspaceDir) return false;
    return fs.existsSync(path.join(workspaceDir, 'plan.md'));
  }
}

export const planFileService = new PlanFileServiceImpl();
