class Result:
    def __init__(self, code: int, message: str = "", data: object = None):
        self.code = code
        self.message = message
        self.data = data or None

    def success(self,code:int = 200, message: str = "Success", data: object = None) -> 'Result':
        self = self.__init__(code, message, data)
        return self

    def error(self, code: int = 500, message: str = "Error", data: object = None) -> 'Result':
        self = self.__init__(code, message, data)
        return self