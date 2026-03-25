function toDate(value: string | number | Date) {
  return value instanceof Date ? value : new Date(value)
}

export function isValidDateValue(value: unknown) {
  if (!(typeof value === 'string' || typeof value === 'number' || value instanceof Date)) {
    return false
  }

  return !Number.isNaN(toDate(value).getTime())
}

export function formatDateTime(value: string | number | Date) {
  if (!isValidDateValue(value)) {
    return ''
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(toDate(value))
}
