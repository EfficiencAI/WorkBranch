# IoC 容器：使用 @lru_cache 保证单例，配合 FastAPI Depends() 实现依赖注入
# 类比 Spring：@lru_cache 相当于 @Bean，Depends() 相当于 @Autowired
from functools import lru_cache

from core.logging.runtime import LoggingRuntime
from db.sqlite import Database
from data.file_storage_system import FileStorageSystem
from service.agent_service.service import WorkspaceService, LLMService
from service.settings_service.settings_service import SettingsService
from service.session_service.mq import MessageQueue


@lru_cache(maxsize=1)
def get_settings_service() -> SettingsService:
    return SettingsService()

@lru_cache(maxsize=1)
def get_database() -> Database:
    return Database()

@lru_cache(maxsize=1)
def get_conversation_buffer():
    from service.session_service.conversation_buffer import ConversationBuffer
    return ConversationBuffer()

@lru_cache(maxsize=1)
def get_file_storage_system() -> FileStorageSystem:
    return FileStorageSystem()

@lru_cache(maxsize=1)
def get_user_service():
    from service.user_service.user import UserService
    return UserService()

@lru_cache(maxsize=1)
def get_session_history():
    from service.user_service.session_history import SessionHistory
    return SessionHistory()

@lru_cache(maxsize=1)
def get_session_service():
    from service.session_service.session import SessionService
    return SessionService()

@lru_cache(maxsize=1)
def get_conversation_service():
    from service.session_service.conversation_service import ConversationService
    return ConversationService()

@lru_cache(maxsize=1)
def get_agent_service():
    from service.agent_service import AgentService
    llm = get_llm_service()
    ws = get_workspace_service()
    mq = get_message_queue()
    return AgentService(ws, llm, mq)

@lru_cache(maxsize=1)
def get_workspace_service() -> WorkspaceService:
    settings = get_settings_service()
    try:
        base_dir = settings.get("workspace:base_dir")
    except KeyError:
        base_dir = "workspaces"
    return WorkspaceService(base_dir)

@lru_cache(maxsize=1)
def get_llm_service() -> LLMService:
    settings = get_settings_service()
    return LLMService(settings)

@lru_cache(maxsize=1)
def get_user_info_dao():
    from data.user_info_dao import UserInfoDAO
    return UserInfoDAO()

@lru_cache(maxsize=1)
def get_conversation_dao():
    from data.conversation_dao import ConversationDAO
    return ConversationDAO()

@lru_cache(maxsize=1)
def get_message_queue() -> MessageQueue:
    settings = get_settings_service()
    return MessageQueue(settings)


@lru_cache(maxsize=1)
def get_logging_runtime() -> LoggingRuntime:
    settings = get_settings_service()
    return LoggingRuntime(settings)


def clear_all_singletons():
    """清除所有单例缓存（例如测试用例 teardown 时调用）"""
    try:
        get_logging_runtime().shutdown()
    except Exception:
        pass

    get_settings_service.cache_clear()
    get_database.cache_clear()
    get_conversation_buffer.cache_clear()
    get_file_storage_system.cache_clear()
    get_user_service.cache_clear()
    get_session_history.cache_clear()
    get_session_service.cache_clear()
    get_conversation_service.cache_clear()
    get_agent_service.cache_clear()
    get_workspace_service.cache_clear()
    get_llm_service.cache_clear()
    get_user_info_dao.cache_clear()
    get_conversation_dao.cache_clear()
    get_message_queue.cache_clear()
    get_logging_runtime.cache_clear()
