import { Tag } from 'antd'

type StatusTagTone = 'default' | 'success' | 'warning' | 'error' | 'processing'

type StatusTagProps = {
  label: string
  tone?: StatusTagTone
}

const colorMap: Record<StatusTagTone, string> = {
  default: 'default',
  success: 'success',
  warning: 'warning',
  error: 'error',
  processing: 'processing',
}

export function StatusTag({ label, tone = 'default' }: StatusTagProps) {
  return <Tag color={colorMap[tone]}>{label}</Tag>
}
