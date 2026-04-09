export interface User {
    id: number;
    name: string;
    created_at?: string;
}
export interface Session {
    id: number;
    user_id: number;
    title: string;
    created_at: string;
    updated_at: string;
}
export interface UserProfile {
    id: number;
    name: string;
}
//# sourceMappingURL=user.d.ts.map