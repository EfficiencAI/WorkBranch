import { userDAO, type User } from '../../data';

export class UserService {
  getCurrentUser(): User {
    return userDAO.getOrCreateDefaultUser();
  }

  updateUserName(newName: string): User {
    const user = this.getCurrentUser();
    userDAO.updateUserName(user.id, newName);
    return userDAO.getUserById(user.id)!;
  }
}

export const userService = new UserService();
