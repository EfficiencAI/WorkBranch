import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { assistantDAO, type ShareInfo } from '../../data';

export interface CreateShareInput {
  mode?: 'public' | 'password';
  password?: string;
  expiresAt?: string | null;
}

/** 分享服务（P0 骨架）：token 生成、创建、列表、启停 */
class ShareService {
  generateToken(): string {
    return randomBytes(4).toString('base64url') + randomBytes(2).toString('base64url');
  }

  create(assistantId: number, input: CreateShareInput = {}): ShareInfo {
    const token = this.generateToken();
    const id = assistantDAO.createShare(
      assistantId,
      token,
      input.mode ?? 'public',
      input.password ? this.hashPassword(input.password) : null,
      input.expiresAt ?? null,
    );
    const share = assistantDAO.listShares(assistantId).find((s) => s.id === id);
    if (!share) throw new Error('创建分享失败');
    return share;
  }

  list(assistantId: number): ShareInfo[] {
    return assistantDAO.listShares(assistantId);
  }

  setEnabled(assistantId: number, shareId: number, enabled: boolean): ShareInfo {
    const share = this.list(assistantId).find((s) => s.id === shareId);
    if (!share) throw new Error('分享不存在');
    assistantDAO.setShareEnabled(shareId, enabled ? 1 : 0);
    const updated = this.list(assistantId).find((s) => s.id === shareId);
    if (!updated) throw new Error('分享不存在');
    return updated;
  }

  getByToken(token: string): ShareInfo | null {
    return assistantDAO.getShareByToken(token);
  }

  verifyPassword(share: ShareInfo, password: string): boolean {
    if (share.mode !== 'password' || !share.password_hash) return true;
    const [salt, hash] = share.password_hash.split(':');
    if (!salt || !hash) return false;
    const candidate = scryptSync(password, salt, 32);
    const expected = Buffer.from(hash, 'hex');
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  }

  private hashPassword(password: string): string {
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync(password, salt, 32).toString('hex');
    return `${salt}:${hash}`;
  }
}

export const shareService = new ShareService();
