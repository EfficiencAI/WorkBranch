"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SegmentType = void 0;
exports.resetCounter = resetCounter;
exports.buildSegment = buildSegment;
exports.createContentBlock = createContentBlock;
exports.createMessage = createMessage;
exports.messageToDict = messageToDict;
var SegmentType;
(function (SegmentType) {
    SegmentType["THINKING_START"] = "thinking_start";
    SegmentType["THINKING_DELTA"] = "thinking_delta";
    SegmentType["THINKING_END"] = "thinking_end";
    SegmentType["THINKING"] = "thinking";
    SegmentType["TEXT_START"] = "text_start";
    SegmentType["TEXT_DELTA"] = "text_delta";
    SegmentType["TEXT_END"] = "text_end";
    SegmentType["PLAN_START"] = "plan_start";
    SegmentType["PLAN_DELTA"] = "plan_delta";
    SegmentType["PLAN_END"] = "plan_end";
    SegmentType["STATE_CHANGE"] = "state_change";
    SegmentType["TOOL_CALL"] = "tool_call";
    SegmentType["TOOL_RES"] = "tool_res";
    SegmentType["ERROR"] = "error";
    SegmentType["DONE"] = "done";
})(SegmentType || (exports.SegmentType = SegmentType = {}));
let counter = {};
function nextIdx(mid) {
    if (!(mid in counter)) {
        counter[mid] = 0;
    }
    counter[mid]++;
    return counter[mid];
}
function resetCounter(mid) {
    if (mid) {
        delete counter[mid];
    }
    else {
        counter = {};
    }
}
function buildSegment(cid, mid, segmentType, payload = '', meta = {}) {
    return {
        cid,
        mid,
        idx: nextIdx(mid),
        type: segmentType,
        payload,
        meta,
    };
}
function createContentBlock(type, content = '', metadata = {}) {
    return { type, content, metadata };
}
function createMessage(role, messageId, conversationId, sessionId, workspaceId, contentBlocks = [], content = '', metadata = {}) {
    return {
        role,
        message_id: messageId,
        conversation_id: conversationId,
        session_id: sessionId,
        workspace_id: workspaceId,
        content_blocks: contentBlocks,
        content,
        timestamp: new Date().toISOString(),
        metadata,
    };
}
function messageToDict(message) {
    return {
        role: message.role,
        message_id: message.message_id,
        conversation_id: message.conversation_id,
        session_id: message.session_id,
        workspace_id: message.workspace_id,
        content_blocks: message.content_blocks.map((b) => ({
            type: b.type,
            content: b.content,
            metadata: b.metadata,
        })),
        content: message.content,
        timestamp: message.timestamp,
        metadata: message.metadata,
    };
}
//# sourceMappingURL=canonical.js.map