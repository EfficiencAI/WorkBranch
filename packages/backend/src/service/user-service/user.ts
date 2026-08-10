import { userDAO, type User } from '../../data';

export class UserService {
  getCurrentUser(): User {
    return userDAO.getOrCreateDefaultUser();
  }

  updateUserName(userId: number, newName: string): User {
    const user = this.getCurrentUser();
    userDAO.updateUserName(userId, newName);
    return userDAO.getUserById(user.id)!;
  }
}

export const userService = new UserService();
