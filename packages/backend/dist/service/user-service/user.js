"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userService = exports.UserService = void 0;
const data_1 = require("../../data");
class UserService {
    getCurrentUser() {
        return data_1.userDAO.getOrCreateDefaultUser();
    }
    updateUserName(newName) {
        const user = this.getCurrentUser();
        data_1.userDAO.updateUserName(user.id, newName);
        return data_1.userDAO.getUserById(user.id);
    }
}
exports.UserService = UserService;
exports.userService = new UserService();
//# sourceMappingURL=user.js.map