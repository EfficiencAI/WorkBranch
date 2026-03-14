import json

Setting_File_Path: str = "../setting.json"

class Settings:
    Setting_Instance: 'Settings' = None
    Settings: dict = {}
    # Singleton ,and don't want to use __new__ method, 
    # then use async don't use concurrent.futures.ThreadPoolExecutor
    def get_instance()-> 'Settings':
        if Settings.Setting_Instance is None:
             Settings.Setting_Instance = Settings(Setting_File_Path)        
        return Settings.Setting_Instance
    
    def get_data(self,key:str) -> str:
        return self.Settings.get(key, "")

    def save_data(self,key:str, value:str) -> bool:
        self.Settings[key] = value
        return True

    def delete_data(self,key:str) -> bool:
        if key in self.Settings:
            del self.Settings[key]
            return True
        return False
    
    def update_data(self, key:str, value:str) -> bool:
        if key in self.Settings:
            self.Settings[key] = value
            return True
        return False

    def load_all_data(self) -> dict:
        return self.Settings
    
    def relaod_data(self):
        self.Settings = json.load(open(Setting_File_Path, "r"))

    def __init__(self, file_path):
        self.Settings = json.load(open(file_path, "r"))

    def __new__(cls, *args, **kwargs):
        raise SyntaxError("Use get_instance() method to get the instance of Settings class")
    