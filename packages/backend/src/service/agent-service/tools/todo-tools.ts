import type { TodoItem } from '../state/agent-state';
import { logger } from '../../../core/logging';

export interface UpdateTodoArgs {
  todos: TodoItem[];
  doingIdx?: number;
}

export interface TodoUpdateResult {
  success: boolean;
  todos: TodoItem[];
  current_todo_index: number;
  current_todo_goal?: string;
  current_todo_done_when?: string;
}

export function updateTodo(
  workspaceId: string,
  args: UpdateTodoArgs
): TodoUpdateResult {
  const todos = args.todos || [];
  const doingIdx = args.doingIdx ?? 0;

  if (todos.length === 0) {
    return {
      success: false,
      todos: [],
      current_todo_index: 0,
    };
  }

  const validIdx = Math.max(0, Math.min(doingIdx, todos.length - 1));
  const currentTodo = todos[validIdx];

  logger.debug({
    event: 'todo.update',
    workspace_id: workspaceId,
    todo_count: todos.length,
    current_index: validIdx,
  });

  return {
    success: true,
    todos,
    current_todo_index: validIdx,
    current_todo_goal: currentTodo?.goal,
    current_todo_done_when: currentTodo?.done_when,
  };
}

export function createTodoList(descriptions: string[]): TodoItem[] {
  return descriptions.map((desc, idx) => ({
    id: idx + 1,
    description: desc,
    status: 'pending' as const,
  }));
}

export function advanceTodo(
  todos: TodoItem[],
  currentIndex: number
): { todos: TodoItem[]; newIndex: number; completed: boolean } {
  if (currentIndex >= todos.length) {
    return { todos, newIndex: currentIndex, completed: true };
  }

  const updatedTodos = todos.map((todo, idx) => {
    if (idx === currentIndex) {
      return { ...todo, status: 'completed' as const };
    }
    if (idx === currentIndex + 1) {
      return { ...todo, status: 'in_progress' as const };
    }
    return todo;
  });

  const newIndex = currentIndex + 1;
  const completed = newIndex >= todos.length;

  logger.debug({
    event: 'todo.advance',
    current_index: currentIndex,
    new_index: newIndex,
    completed,
  });

  return { todos: updatedTodos, newIndex, completed };
}

export function failCurrentTodo(
  todos: TodoItem[],
  currentIndex: number,
  error?: string
): TodoItem[] {
  return todos.map((todo, idx) => {
    if (idx === currentIndex) {
      return {
        ...todo,
        status: 'failed' as const,
        result: error || 'Task failed',
      };
    }
    return todo;
  });
}
