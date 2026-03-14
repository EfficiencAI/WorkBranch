from typing import Optional, TypeVar, Type, Any

T = TypeVar('T')

_singletons: dict[Type, Any] = {}

def _get_singleton(cls: Type[T]) -> Optional[T]:
    return _singletons.get(cls)

def _register_singleton(instance: T, cls: Type[T]) -> T:
    _singletons[cls] = instance
    return instance

def _clear_singletons():
    _singletons.clear()

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

_settings: Optional[Settings] = None
_database: Optional[Database] = None
_conversation_buffer: Optional[ConversationBuffer] = None
_file_storage_system: Optional[FileStorageSystem] = None
_user_service: Optional[UserService] = None
_session_history: Optional[SessionHistory] = None
_session_service: Optional[SessionService] = None
_conversation_creator: Optional[ConversationCreator] = None
_agent_service: Optional[AgentService] = None
_workspace_service: Optional[WorkspaceService] = None
_settings_parse_service: Optional[SettingsParseService] = None
_user_info_dao: Optional[UserInfoDAO] = None
_conversation_dao: Optional[ConversationDAO] = None

def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings

def get_database() -> Database:
    global _database
    if _database is None:
        _database = Database()
    return _database

def get_conversation_buffer() -> ConversationBuffer:
    global _conversation_buffer
    if _conversation_buffer is None:
        _conversation_buffer = ConversationBuffer()
    return _conversation_buffer

def get_file_storage_system() -> FileStorageSystem:
    global _file_storage_system
    if _file_storage_system is None:
        _file_storage_system = FileStorageSystem()
    return _file_storage_system

def get_user_service() -> UserService:
    global _user_service
    if _user_service is None:
        _user_service = UserService()
    return _user_service

def get_session_history() -> SessionHistory:
    global _session_history
    if _session_history is None:
        _session_history = SessionHistory()
    return _session_history

def get_session_service() -> SessionService:
    global _session_service
    if _session_service is None:
        _session_service = SessionService()
    return _session_service

def get_conversation_creator() -> ConversationCreator:
    global _conversation_creator
    if _conversation_creator is None:
        _conversation_creator = ConversationCreator()
    return _conversation_creator

def get_agent_service() -> AgentService:
    global _agent_service
    if _agent_service is None:
        _agent_service = AgentService()
    return _agent_service

def get_workspace_service() -> WorkspaceService:
    global _workspace_service
    if _workspace_service is None:
        _workspace_service = WorkspaceService()
    return _workspace_service

def get_settings_parse_service() -> SettingsParseService:
    global _settings_parse_service
    if _settings_parse_service is None:
        _settings_parse_service = SettingsParseService()
    return _settings_parse_service

def get_user_info_dao() -> UserInfoDAO:
    global _user_info_dao
    if _user_info_dao is None:
        _user_info_dao = UserInfoDAO()
    return _user_info_dao

def get_conversation_dao() -> ConversationDAO:
    global _conversation_dao
    if _conversation_dao is None:
        _conversation_dao = ConversationDAO()
    return _conversation_dao

def clear_all_singletons():
    global _settings, _database, _conversation_buffer, _file_storage_system
    global _user_service, _session_history, _session_service, _conversation_creator
    global _agent_service, _workspace_service, _settings_parse_service
    global _user_info_dao, _conversation_dao
    _settings = None
    _database = None
    _conversation_buffer = None
    _file_storage_system = None
    _user_service = None
    _session_history = None
    _session_service = None
    _conversation_creator = None
    _agent_service = None
    _workspace_service = None
    _settings_parse_service = None
    _user_info_dao = None
    _conversation_dao = None
    _clear_singletons()
