import type { Session } from './conversation-dao';
export interface User {
    id: number;
    name: string | null;
}
export declare class UserDAO {
    createUser(name: string): number;
    getUserById(userId: number): User | null;
    listSessions(userId: number): Session[];
    deleteUser(userId: number): void;
    updateUserName(userId: number, newName: string): void;
    getOrCreateDefaultUser(): User;
}
export declare const userDAO: UserDAO;
//# sourceMappingURL=user-dao.d.ts.map