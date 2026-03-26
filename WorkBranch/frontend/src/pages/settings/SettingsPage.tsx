import {
  Alert,
  App as AntdApp,
  Button,
  Card,
  Flex,
  Input,
  InputNumber,
  Space,
  Switch,
  Typography,
} from 'antd'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SettingNode, SettingValue } from '../../entities'
import { getErrorMessage, get, patch } from '../../shared/api'
import { settingsConfig } from '../../shared/config/settings'
import { cloneDeepJson, getValueAtPath, isPlainObject, setValueAtPath } from '../../shared/lib'
import { LoadingState, StatusTag } from '../../shared/ui'

type EditorKind = 'string' | 'number' | 'boolean' | 'json' | 'secret'

type EditingState = {
  rootKey: string
  path: string[]
  kind: EditorKind
  value: string | number | boolean | null
}

const MAX_RENDER_DEPTH = 5

function isSecretField(path: string[]) {
  return path[path.length - 1] === 'api_key'
}

function getEditorKind(path: string[], value: SettingValue, depth: number): EditorKind {
  if (isSecretField(path)) {
    return 'secret'
  }

  if (typeof value === 'string') {
    return 'string'
  }

  if (typeof value === 'number') {
    return 'number'
  }

  if (typeof value === 'boolean') {
    return 'boolean'
  }

  if (value === null || Array.isArray(value)) {
    return 'json'
  }

  if (isPlainObject(value)) {
    return depth > MAX_RENDER_DEPTH ? 'json' : 'json'
  }

  return 'json'
}

function formatReadonlyValue(path: string[], value: SettingValue) {
  if (isSecretField(path)) {
    return value ? '已设置' : '未设置'
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }

  if (value === null) {
    return 'null'
  }

  if (Array.isArray(value) || isPlainObject(value)) {
    return JSON.stringify(value, null, 2)
  }

  return String(value)
}

function buildInitialEditorValue(kind: EditorKind, value: SettingValue) {
  if (kind === 'secret') {
    return ''
  }

  if (kind === 'number') {
    return typeof value === 'number' ? value : null
  }

  if (kind === 'boolean') {
    return typeof value === 'boolean' ? value : false
  }

  if (kind === 'json') {
    return JSON.stringify(value, null, 2)
  }

  return value === null ? '' : String(value)
}

function parseEditorValue(kind: EditorKind, value: string | number | boolean | null, originalValue: SettingValue) {
  if (kind === 'secret') {
    return value === '' ? originalValue : String(value)
  }

  if (kind === 'string') {
    return String(value ?? '')
  }

  if (kind === 'number') {
    const parsed = typeof value === 'number' ? value : Number(value)
    if (Number.isNaN(parsed)) {
      throw new Error('请输入有效数字')
    }
    return parsed
  }

  if (kind === 'boolean') {
    return Boolean(value)
  }

  try {
    return JSON.parse(String(value ?? 'null')) as SettingValue
  } catch {
    throw new Error('请输入合法的 JSON')
  }
}

type SettingsPageProps = {
  embedded?: boolean
}

export function SettingsPage({ embedded = false }: SettingsPageProps) {
  const { message } = AntdApp.useApp()
  const [settings, setSettings] = useState<SettingNode | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<EditingState | null>(null)
  const [draftRoot, setDraftRoot] = useState<SettingValue | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const result = await get<SettingNode>(settingsConfig.endpoint)
      setSettings(result)
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, '设置加载失败'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  const entries = useMemo(() => Object.entries(settings ?? {}), [settings])

  function cancelEditing() {
    setEditing(null)
    setDraftRoot(null)
    setSaveError(null)
  }

  function beginEditing(rootKey: string, path: string[], value: SettingValue, depth: number) {
    if (!settings) {
      return
    }

    const rootValue = settings[rootKey]
    if (rootValue === undefined) {
      return
    }

    const kind = getEditorKind(path, value, depth)
    setEditing({
      rootKey,
      path,
      kind,
      value: buildInitialEditorValue(kind, value),
    })
    setDraftRoot(cloneDeepJson(rootValue))
    setSaveError(null)
  }

  function updateEditingValue(nextValue: string | number | boolean | null) {
    setEditing((current) => (current ? { ...current, value: nextValue } : current))
    setSaveError(null)
  }

  async function saveLeaf() {
    if (!settings || !editing || draftRoot === null) {
      return
    }

    const originalRoot = settings[editing.rootKey]
    if (originalRoot === undefined) {
      return
    }

    const originalValue = getValueAtPath<SettingValue>(originalRoot, editing.path)
    if (originalValue === undefined) {
      setSaveError('找不到当前设置项')
      return
    }

    try {
      setSaving(true)
      setSaveError(null)

      const parsedValue = parseEditorValue(editing.kind, editing.value, originalValue)
      const nextRoot = cloneDeepJson(draftRoot)
      const updatedRoot = setValueAtPath(nextRoot, editing.path, parsedValue)

      await patch<void, Partial<SettingNode>>(settingsConfig.endpoint, {
        [editing.rootKey]: updatedRoot,
      })

      setSettings((current) => {
        if (!current) {
          return current
        }

        return {
          ...current,
          [editing.rootKey]: updatedRoot,
        }
      })

      message.success('设置已保存')
      cancelEditing()
    } catch (caughtError) {
      setSaveError(getErrorMessage(caughtError, '设置保存失败'))
    } finally {
      setSaving(false)
    }
  }

  function renderEditor() {
    if (!editing) {
      return null
    }

    if (editing.kind === 'boolean') {
      return <Switch checked={Boolean(editing.value)} onChange={(checked) => updateEditingValue(checked)} />
    }

    if (editing.kind === 'number') {
      return (
        <InputNumber
          value={typeof editing.value === 'number' ? editing.value : null}
          onChange={(value) => updateEditingValue(value)}
          style={{ width: '100%' }}
        />
      )
    }

    if (editing.kind === 'secret') {
      return (
        <Input.Password
          value={String(editing.value ?? '')}
          onChange={(event) => updateEditingValue(event.target.value)}
          placeholder="留空则保持原值"
        />
      )
    }

    if (editing.kind === 'json') {
      return (
        <Input.TextArea
          value={String(editing.value ?? '')}
          onChange={(event) => updateEditingValue(event.target.value)}
          autoSize={{ minRows: 4, maxRows: 12 }}
        />
      )
    }

    return <Input value={String(editing.value ?? '')} onChange={(event) => updateEditingValue(event.target.value)} />
  }

  function renderReadonlyValue(path: string[], value: SettingValue) {
    if (Array.isArray(value) || isPlainObject(value)) {
      return <pre className="settings-pre">{formatReadonlyValue(path, value)}</pre>
    }

    return <Typography.Text>{formatReadonlyValue(path, value)}</Typography.Text>
  }

  function renderNode(rootKey: string, path: string[], value: SettingValue, depth: number): ReactNode {
    const fullPath = [rootKey, ...path]
    const label = path[path.length - 1] ?? rootKey
    const isTooDeepObject = isPlainObject(value) && depth > MAX_RENDER_DEPTH
    const isLeaf = !isPlainObject(value) || isTooDeepObject
    const isEditingLeaf =
      editing?.rootKey === rootKey &&
      editing.path.length === path.length &&
      editing.path.every((segment, index) => segment === path[index])

    if (!isLeaf && isPlainObject(value)) {
      return (
        <div key={fullPath.join('.')} className={`settings-tree-node settings-tree-node--group depth-${depth}`}>
          <Typography.Title level={5} className="settings-tree-node__title">
            {label}
          </Typography.Title>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            {Object.entries(value).map(([childKey, childValue]) => renderNode(rootKey, [...path, childKey], childValue, depth + 1))}
          </Space>
        </div>
      )
    }

    return (
      <div key={fullPath.join('.')} className={`settings-tree-leaf depth-${depth}`}>
        <Flex justify="space-between" align="flex-start" gap={16} wrap="wrap">
          <div className="settings-tree-leaf__meta">
            <Typography.Text strong>{label}</Typography.Text>
            <Typography.Paragraph type="secondary" className="settings-tree-leaf__path">
              {fullPath.join('.')}
            </Typography.Paragraph>
          </div>
          <Space>
            {isEditingLeaf ? (
              <>
                <Button type="primary" size="small" loading={saving} onClick={() => void saveLeaf()}>
                  保存
                </Button>
                <Button size="small" disabled={saving} onClick={cancelEditing}>
                  取消
                </Button>
              </>
            ) : (
              <Button size="small" disabled={saving || editing !== null} onClick={() => beginEditing(rootKey, path, value, depth)}>
                编辑
              </Button>
            )}
          </Space>
        </Flex>

        <div className="settings-tree-leaf__value">{isEditingLeaf ? renderEditor() : renderReadonlyValue(fullPath, value)}</div>

        {isEditingLeaf && isSecretField(fullPath) ? (
          <Typography.Paragraph type="secondary" className="settings-tree-leaf__hint">
            留空表示保持当前密钥不变。
          </Typography.Paragraph>
        ) : null}
      </div>
    )
  }

  return (
    <Space
      direction="vertical"
      size={embedded ? 'middle' : 'large'}
      style={{ width: '100%' }}
      className={embedded ? 'settings-page settings-page--embedded' : 'settings-page'}
    >
      <Flex justify="space-between" align="center" wrap="wrap" gap={12}>
        <div>
          <Typography.Title level={embedded ? 3 : 2}>设置</Typography.Title>
          <Typography.Paragraph type="secondary">
            当前页面根据后端返回的树形设置 JSON 动态生成，支持叶子节点编辑与提交。
          </Typography.Paragraph>
        </div>
        <StatusTag
          label={loading ? '加载中' : error ? '加载失败' : saving ? '保存中' : '已同步'}
          tone={loading || saving ? 'processing' : error ? 'error' : 'success'}
        />
      </Flex>

      {loading ? <LoadingState tip="正在读取后端设置..." /> : null}

      {error ? <Alert type="error" message="设置读取失败" description={error} showIcon /> : null}
      {saveError ? <Alert type="error" message="设置保存失败" description={saveError} showIcon /> : null}

      {!loading && !error ? (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {entries.map(([rootKey, rootValue]) => (
            <Card title={rootKey} className="settings-card" key={rootKey}>
              {isPlainObject(rootValue)
                ? Object.entries(rootValue).map(([childKey, childValue]) => renderNode(rootKey, [childKey], childValue, 1))
                : renderNode(rootKey, [], rootValue, 1)}
            </Card>
          ))}
        </Space>
      ) : null}
    </Space>
  )
}
