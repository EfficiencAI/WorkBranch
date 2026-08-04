export function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  
  if (diff < 60000) {
    return '刚刚';
  } else if (diff < 3600000) {
    return `${Math.floor(diff / 60000)} 分钟前`;
  } else if (diff < 86400000) {
    return `${Math.floor(diff / 3600000)} 小时前`;
  } else if (diff < 604800000) {
    return `${Math.floor(diff / 86400000)} 天前`;
  } else {
    return formatDate(timestamp);
  }
}

export function parseISODate(isoString: string): number {
  return new Date(isoString).getTime();
}

export function toISODate(timestamp: number): string {
  return new Date(timestamp).toISOString();
}
