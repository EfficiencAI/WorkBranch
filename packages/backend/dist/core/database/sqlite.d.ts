import Database from 'better-sqlite3';
export interface SessionRow {
    id: number;
    user_id: number | null;
    title: string;
    created_at: string;
    updated_at: string;
}
export interface ConversationRow {
    id: string;
    session_id: number;
    workspace_id: string | null;
    parent_conversation_id: string | null;
    title: string | null;
    state: string | null;
    created_at: string;
    updated_at: string;
    ended_at: string | null;
    message_count: number;
    error: string | null;
    position_x: number | null;
    position_y: number | null;
}
export interface MessageRow {
    id: string;
    conversation_id: string;
    session_id: number;
    user_content: string;
    assistant_content: string | null;
    thinking_content: string | null;
    status: string;
    created_at: string;
    updated_at: string;
}
export interface UserRow {
    id: number;
    name: string | null;
}
export declare class SQLiteDatabase {
    private db;
    private static instance;
    private constructor();
    static getInstance(): SQLiteDatabase;
    private initialize;
    prepare(sql: string): Database.Statement;
    transaction<T>(fn: () => T): T;
    exec(sql: string): void;
    close(): void;
}
export declare const db: SQLiteDatabase;
//# sourceMappingURL=sqlite.d.ts.map