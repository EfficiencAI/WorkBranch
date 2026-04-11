import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../../../core/logging';
import type { AgentState } from '../state/agent-state';

interface StateMetadata {
  workspace_id: string;
  saved_at: string;
  state: AgentState;
}

export class PersistenceService {
  private storageDir: string;

  constructor(storageDir: string = '.temp/agent-states') {
    this.storageDir = storageDir;
  }

  private getStatePath(workspaceId: string): string {
    return path.join(this.storageDir, `${workspaceId}.json`);
  }

  async save(workspaceId: string, state: AgentState): Promise<boolean> {
    logger.info({ event: 'persistence.save.started', workspace_id: workspaceId });

    const statePath = this.getStatePath(workspaceId);

    try {
      await fs.mkdir(this.storageDir, { recursive: true });

      const stateWithMeta: StateMetadata = {
        workspace_id: workspaceId,
        saved_at: new Date().toISOString(),
        state,
      };

      await fs.writeFile(statePath, JSON.stringify(stateWithMeta, null, 2), 'utf-8');

      logger.info({ event: 'persistence.save.completed', path: statePath });
      return true;
    } catch (err) {
      logger.error({ event: 'persistence.save.failed', workspace_id: workspaceId, error: String(err) });
      return false;
    }
  }

  async load(workspaceId: string): Promise<AgentState | null> {
    logger.info({ event: 'persistence.load.started', workspace_id: workspaceId });

    const statePath = this.getStatePath(workspaceId);

    try {
      const content = await fs.readFile(statePath, 'utf-8');
      const data: StateMetadata = JSON.parse(content);

      logger.info({ event: 'persistence.load.completed', saved_at: data.saved_at });
      return data.state;
    } catch (err) {
      logger.info({ event: 'persistence.load.not_found', workspace_id: workspaceId });
      return null;
    }
  }

  async delete(workspaceId: string): Promise<boolean> {
    logger.info({ event: 'persistence.delete.started', workspace_id: workspaceId });

    const statePath = this.getStatePath(workspaceId);

    try {
      await fs.unlink(statePath);
      logger.info({ event: 'persistence.delete.completed', path: statePath });
      return true;
    } catch {
      return false;
    }
  }

  async exists(workspaceId: string): Promise<boolean> {
    const statePath = this.getStatePath(workspaceId);
    try {
      await fs.access(statePath);
      return true;
    } catch {
      return false;
    }
  }

  async listAll(): Promise<Array<{ workspace_id: string; saved_at: string }>> {
    const states: Array<{ workspace_id: string; saved_at: string }> = [];

    try {
      const files = await fs.readdir(this.storageDir);

      for (const filename of files) {
        if (filename.endsWith('.json')) {
          const workspaceId = filename.slice(0, -5);
          const statePath = this.getStatePath(workspaceId);

          try {
            const content = await fs.readFile(statePath, 'utf-8');
            const data: StateMetadata = JSON.parse(content);
            states.push({
              workspace_id: workspaceId,
              saved_at: data.saved_at,
            });
          } catch {
            // skip invalid files
          }
        }
      }
    } catch {
      // directory doesn't exist
    }

    return states;
  }
}

export const persistenceService = new PersistenceService();
