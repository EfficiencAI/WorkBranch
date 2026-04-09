"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkspaceController = void 0;
const agent_service_1 = require("../service/agent-service");
const result_1 = require("./result");
class WorkspaceController {
    async getWorkspace(request, reply) {
        const { workspaceId } = request.params;
        const info = agent_service_1.workspaceService.getWorkspaceInfo(workspaceId);
        if (!info) {
            return reply.status(404).send({
                code: 404,
                message: `Workspace not found: ${workspaceId}`,
                data: null
            });
        }
        return reply.send((0, result_1.success)({
            id: workspaceId,
            session_id: info.session_id,
            status: info.status,
            created_at: info.created_at,
            dir: agent_service_1.workspaceService.getWorkspaceDir(workspaceId),
        }));
    }
}
exports.WorkspaceController = WorkspaceController;
//# sourceMappingURL=workspace.controller.js.map