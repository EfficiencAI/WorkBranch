"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskStatus = exports.TaskPhase = exports.IntentType = exports.AgentType = void 0;
exports.createInitialState = createInitialState;
var AgentType;
(function (AgentType) {
    AgentType["PLAN_AGENT"] = "plan_agent";
    AgentType["BUILD_AGENT"] = "build_agent";
    AgentType["REVIEW_AGENT"] = "review_agent";
    AgentType["EXPLORE_AGENT"] = "explore_agent";
    AgentType["ADMIN_AGENT"] = "admin_agent";
})(AgentType || (exports.AgentType = AgentType = {}));
var IntentType;
(function (IntentType) {
    IntentType["DEVELOP"] = "develop";
    IntentType["EXPLORE"] = "explore";
    IntentType["REVIEW"] = "review";
    IntentType["QUESTION"] = "question";
    IntentType["DEBUG"] = "debug";
    IntentType["REFACTOR"] = "refactor";
    IntentType["OTHER"] = "other";
})(IntentType || (exports.IntentType = IntentType = {}));
var TaskPhase;
(function (TaskPhase) {
    TaskPhase["RESEARCH"] = "research";
    TaskPhase["SYNTHESIS"] = "synthesis";
    TaskPhase["IMPLEMENTATION"] = "implementation";
    TaskPhase["VERIFICATION"] = "verification";
})(TaskPhase || (exports.TaskPhase = TaskPhase = {}));
var TaskStatus;
(function (TaskStatus) {
    TaskStatus["PENDING"] = "pending";
    TaskStatus["IN_PROGRESS"] = "in_progress";
    TaskStatus["COMPLETED"] = "completed";
    TaskStatus["FAILED"] = "failed";
})(TaskStatus || (exports.TaskStatus = TaskStatus = {}));
function createInitialState(workspaceId) {
    return {
        messages: [],
        workspace_id: workspaceId,
        plan: [],
        current_step: 0,
        results: [],
        plan_failed: false,
        tool_history: [],
        replan_count: 0,
        agent_type: undefined,
        intent_analysis: undefined,
        parent_chain_messages: undefined,
        current_conversation_messages: undefined,
        execution_mode: undefined,
        mode_reason: undefined,
        suggested_tools: undefined,
        suggested_subagent: undefined,
        in_plan_mode: undefined,
        active_subagent: undefined,
        pending_tools: undefined,
    };
}
//# sourceMappingURL=agent-state.js.map