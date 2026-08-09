export { ApiError, getErrorMessage, isApiError } from './error'
export { getApiUrl, getApiBaseUrl } from './config'
export { connectSse } from './sse'
export { del, get, patch, post, put, request } from './http'
export { testLlmConnection } from './settings'
export type { LlmConnectionTestInput, LlmConnectionTestResult } from './settings'
export {
  cancelConversation,
  cascadeDeleteConversation,
  createConversation,
  createSession,
  deleteConversation,
  deleteSession,
  fetchConversationDetail,
  fetchConversationMessages,
  fetchSessionConversations,
  fetchSessionDetail,
  fetchSessions,
  fetchWorkspaceDetail,
  streamConversationMessage,
  updateConversationPositions,
} from './workspace'
export { fetchUserProfile, updateUserName } from './user'
export { fetchCurrentUser, login, logout, register } from './auth'
export {
  createAssistant,
  createFaq,
  createShare,
  createVisitorConversation,
  deleteAssistant,
  deleteFaq,
  deleteSource,
  exportAssistant,
  fetchAssistant,
  fetchAssistants,
  fetchGaps,
  fetchFaqs,
  fetchShareMeta,
  fetchShares,
  fetchSources,
  fetchStats,
  importAssistant,
  reindexSource,
  setShareEnabled,
  runAiCheck,
  streamTrainAnswer,
  streamVisitorAnswer,
  updateAssistant,
  updateFaq,
  uploadSource,
  uploadDirectorySource,
} from './assistant'
export type { AgentId, ChatStreamEvent, StreamConversationMessageBody } from './workspace'
export type { AiCheckResult, AssistantStats, ExportAssistantPackage, ShareMeta, VisitorStreamHandlers } from './assistant'
export type { ApiEnvelope, HttpRequestOptions, RequestMethod, ResponseParseMode, SseEventMessage, SseEventName } from './types'
