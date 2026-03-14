# IoC 容器：使用 @lru_cache 保证单例，配合 FastAPI Depends() 实现依赖注入
# 类比 Spring：@lru_cache 相当于 @Bean，Depends() 相当于 @Autowired
from functools import lru_cache

from data.settings import Settings
from db.sqlite import Database
from service.session_service.conversation_buffer import ConversationBuffer
from data.file_storage_system import FileStorageSystem
from service.user_service.user import UserService
from service.user_service.session_history import SessionHistory
from service.session_service.session import SessionService
from service.session_service.conversation_creator import ConversationCreator
from service.agent_service.agent import AgentService
from service.agent_service.workspace import WorkspaceService
from service.settings_service.settings_parse import SettingsParseService
from data.user_info_dao import UserInfoDAO
from data.conversation_dao import ConversationDAO


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()

@lru_cache(maxsize=1)
def get_database() -> Database:
    return Database()

@lru_cache(maxsize=1)
def get_conversation_buffer() -> ConversationBuffer:
    return ConversationBuffer()

@lru_cache(maxsize=1)
def get_file_storage_system() -> FileStorageSystem:
    return FileStorageSystem()

@lru_cache(maxsize=1)
def get_user_service() -> UserService:
    return UserService()

@lru_cache(maxsize=1)
def get_session_history() -> SessionHistory:
    return SessionHistory()

@lru_cache(maxsize=1)
def get_session_service() -> SessionService:
    return SessionService()

@lru_cache(maxsize=1)
def get_conversation_creator() -> ConversationCreator:
    return ConversationCreator()

@lru_cache(maxsize=1)
def get_agent_service() -> AgentService:
    return AgentService()

@lru_cache(maxsize=1)
def get_workspace_service() -> WorkspaceService:
    return WorkspaceService()

@lru_cache(maxsize=1)
def get_settings_parse_service() -> SettingsParseService:
    return SettingsParseService()

@lru_cache(maxsize=1)
def get_user_info_dao() -> UserInfoDAO:
    return UserInfoDAO()

@lru_cache(maxsize=1)
def get_conversation_dao() -> ConversationDAO:
    return ConversationDAO()


def clear_all_singletons():
    """清除所有单例缓存（例如测试用例 teardown 时调用）"""
    get_settings.cache_clear()
    get_database.cache_clear()
    get_conversation_buffer.cache_clear()
    get_file_storage_system.cache_clear()
    get_user_service.cache_clear()
    get_session_history.cache_clear()
    get_session_service.cache_clear()
    get_conversation_creator.cache_clear()
    get_agent_service.cache_clear()
    get_workspace_service.cache_clear()
    get_settings_parse_service.cache_clear()
    get_user_info_dao.cache_clear()
    get_conversation_dao.cache_clear()
