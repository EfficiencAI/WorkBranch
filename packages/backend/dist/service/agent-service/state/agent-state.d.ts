export declare enum AgentType {
    PLAN_AGENT = "plan_agent",
    BUILD_AGENT = "build_agent",
    REVIEW_AGENT = "review_agent",
    EXPLORE_AGENT = "explore_agent",
    ADMIN_AGENT = "admin_agent"
}
export declare enum IntentType {
    DEVELOP = "develop",
    EXPLORE = "explore",
    REVIEW = "review",
    QUESTION = "question",
    DEBUG = "debug",
    REFACTOR = "refactor",
    OTHER = "other"
}
export declare enum TaskPhase {
    RESEARCH = "research",
    SYNTHESIS = "synthesis",
    IMPLEMENTATION = "implementation",
    VERIFICATION = "verification"
}
export declare enum TaskStatus {
    PENDING = "pending",
    IN_PROGRESS = "in_progress",
    COMPLETED = "completed",
    FAILED = "failed"
}
export interface Task {
    id: number;
    description: string;
    phase: string;
    status: string;
    tool?: string;
    args?: Record<string, unknown>;
    result?: string;
    feedback?: string;
}
export interface ToolCall {
    tool: string;
    args: Record<string, unknown>;
    result?: string;
}
export interface IntentAnalysis {
    intent_type: string;
    summary: string;
    key_points: string[];
    suggested_tools: string[];
    complexity: string;
    confidence: number;
}
export interface AgentState {
    messages: unknown[];
    workspace_id: string;
    plan: Task[];
    current_step: number;
    results: unknown[];
    plan_failed: boolean;
    explore_result?: Record<string, unknown>;
    tool_history: ToolCall[];
    replan_count: number;
    agent_type?: string;
    intent_analysis?: IntentAnalysis;
    parent_chain_messages?: Record<string, unknown>[];
    current_conversation_messages?: Record<string, unknown>[];
    execution_mode?: string;
    mode_reason?: string;
    suggested_tools?: string[];
    suggested_subagent?: string;
    in_plan_mode?: boolean;
    active_subagent?: boolean;
    pending_tools?: Record<string, unknown>[];
}
export declare function createInitialState(workspaceId: string): AgentState;
//# sourceMappingURL=agent-state.d.ts.map