import {
  Alert,
  App as AntdApp,
  Button,
  Card,
  Flex,
  Input,
  InputNumber,
  Slider,
  Space,
  Radio,
  Switch,
  Typography,
} from 'antd'
import type { InputRef } from 'antd'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { NumericSettingMetadata, SettingMetadataNode, SettingValue } from '../../entities'
import { getErrorMessage } from '../../shared/api'
import { cloneDeepJson, getValueAtPath, isPlainObject, setValueAtPath } from '../../shared/lib'
import { EmptyState, LoadingState, StatusTag } from '../../shared/ui'
import { useTheme } from '../../app/theme'
import { useSettings } from '../../app/settings'

type ArrayEditorKind = 'array-string' | 'array-number' | 'array-boolean'
type EditorKind = 'string' | 'number' | 'number-slider' | 'boolean' | 'json' | 'secret' | ArrayEditorKind

type ArrayEditorValue = string[] | number[] | boolean[]

type EditingState = {
  rootKey: string
  path: string[]
  kind: EditorKind
  value: string | number | boolean | null | ArrayEditorValue
  metadata?: NumericSettingMetadata
}

const MAX_RENDER_DEPTH = 5

function isNumericSettingMetadata(value: unknown): value is NumericSettingMetadata {
  if (!isPlainObject(value)) {
    return false
  }

  return value.type === 'number'
}

function getSettingMetadataAtPath(metadata: SettingMetadataNode | null, fullPath: string[]): NumericSettingMetadata | null {
  if (!metadata || fullPath.length === 0) {
    return null
  }

  let current: NumericSettingMetadata | SettingMetadataNode | undefined = metadata
  for (const segment of fullPath) {
    if (!isPlainObject(current) || !(segment in current)) {
      return null
    }

    current = current[segment] as NumericSettingMetadata | SettingMetadataNode | undefined
  }

  return isNumericSettingMetadata(current) ? current : null
}

function hasSliderConfig(metadata: NumericSettingMetadata | null) {
  return metadata?.control === 'slider' && typeof metadata.min === 'number' && typeof metadata.max === 'number' && typeof metadata.step === 'number'
}

function shouldRenderDirectControl(metadata: NumericSettingMetadata | null) {
  return hasSliderConfig(metadata)
}

function clampNumberValue(value: number, metadata?: NumericSettingMetadata) {
  if (!metadata) {
    return value
  }

  let nextValue = value
  if (typeof metadata.min === 'number') {
    nextValue = Math.max(metadata.min, nextValue)
  }
  if (typeof metadata.max === 'number') {
    nextValue = Math.min(metadata.max, nextValue)
  }
  return nextValue
}

function formatSliderValue(value: number) {
  return String(value)
}

function isArrayEditorKind(kind: EditorKind): kind is ArrayEditorKind {
  return kind === 'array-string' || kind === 'array-number' || kind === 'array-boolean'
}

function inferPrimitiveArrayKind(value: SettingValue): ArrayEditorKind | null {
  if (!Array.isArray(value)) {
    return null
  }

  if (value.length === 0) {
    return 'array-string'
  }

  if (value.every((item) => typeof item === 'string')) {
    return 'array-string'
  }

  if (value.every((item) => typeof item === 'number')) {
    return 'array-number'
  }

  if (value.every((item) => typeof item === 'boolean')) {
    return 'array-boolean'
  }

  return null
}

function createDefaultArrayItem(kind: ArrayEditorKind) {
  if (kind === 'array-number') {
    return 0
  }

  if (kind === 'array-boolean') {
    return false
  }

  return ''
}

function getSearchTokens(query: string) {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
}

function matchesSearchTokens(tokens: string[], label: string, fullPath: string) {
  if (tokens.length === 0) {
    return true
  }

  const target = `${label} ${fullPath}`.toLowerCase()
  return tokens.every((token) => target.includes(token))
}

function isPathEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((segment, index) => segment === right[index])
}

function isVisibleLeafValue(value: SettingValue, depth: number) {
  return !isPlainObject(value) || depth > MAX_RENDER_DEPTH
}

function isSecretField(path: string[]) {
  return path[path.length - 1] === 'api_key'
}

function getEditorKind(path: string[], value: SettingValue, depth: number, metadata: NumericSettingMetadata | null): EditorKind {
  if (isSecretField(path)) {
    return 'secret'
  }

  if (typeof value === 'string') {
    return 'string'
  }

  if (typeof value === 'number') {
    return hasSliderConfig(metadata) ? 'number-slider' : 'number'
  }

  if (typeof value === 'boolean') {
    return 'boolean'
  }

  if (value === null) {
    return 'json'
  }

  const primitiveArrayKind = inferPrimitiveArrayKind(value)
  if (primitiveArrayKind) {
    return primitiveArrayKind
  }

  if (Array.isArray(value)) {
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

function buildInitialEditorValue(kind: EditorKind, value: SettingValue): string | number | boolean | null | ArrayEditorValue {
  if (kind === 'secret') {
    return ''
  }

  if (kind === 'number' || kind === 'number-slider') {
    return typeof value === 'number' ? value : null
  }

  if (kind === 'boolean') {
    return typeof value === 'boolean' ? value : false
  }

  if (isArrayEditorKind(kind)) {
    return (Array.isArray(value) ? cloneDeepJson(value) : []) as ArrayEditorValue
  }

  if (kind === 'json') {
    return JSON.stringify(value, null, 2)
  }

  return value === null ? '' : String(value)
}

function parseEditorValue(
  kind: EditorKind,
  value: string | number | boolean | null | ArrayEditorValue,
  originalValue: SettingValue,
  metadata?: NumericSettingMetadata,
) {
  if (kind === 'secret') {
    return value === '' ? originalValue : String(value)
  }

  if (kind === 'string') {
    return String(value ?? '')
  }

  if (kind === 'number' || kind === 'number-slider') {
    const parsed = typeof value === 'number' ? value : Number(value)
    if (Number.isNaN(parsed)) {
      throw new Error('请输入有效数字')
    }
    return clampNumberValue(parsed, metadata)
  }

  if (kind === 'boolean') {
    return Boolean(value)
  }

  if (isArrayEditorKind(kind)) {
    return Array.isArray(value) ? cloneDeepJson(value) : []
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
  const { settings, settingsMetadata, loading, error, patchSettings } = useSettings()
  const [editing, setEditing] = useState<EditingState | null>(null)
  const [draftRoot, setDraftRoot] = useState<SettingValue | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [pendingArrayFocusIndex, setPendingArrayFocusIndex] = useState<number | null>(null)
  const [activeArrayItemIndex, setActiveArrayItemIndex] = useState<number | null>(null)
  const arrayItemRefs = useRef<Array<InputRef | null>>([])

  const { themeMode, setThemeMode } = useTheme()

  useEffect(() => {
    if (pendingArrayFocusIndex === null) {
      return
    }

    const target = arrayItemRefs.current[pendingArrayFocusIndex]
    if (!target) {
      return
    }

    target.focus({ cursor: 'all' })
    setPendingArrayFocusIndex(null)
  }, [editing, pendingArrayFocusIndex])

  const entries = useMemo(() => {
    const allEntries = Object.entries(settings ?? {})

    return allEntries
      .map(([rootKey, rootValue]) => {
        if (rootKey !== 'ui' || !isPlainObject(rootValue)) {
          return [rootKey, rootValue] as const
        }

        const filteredUiEntries = Object.entries(rootValue).filter(([childKey]) => childKey !== 'theme_mode')
        if (filteredUiEntries.length === 0) {
          return null
        }

        return [rootKey, Object.fromEntries(filteredUiEntries) as SettingValue] as const
      })
      .filter((entry): entry is readonly [string, SettingValue] => entry !== null)
  }, [settings])

  const searchTokens = useMemo(() => getSearchTokens(searchQuery), [searchQuery])


  function cancelEditing() {
    setEditing(null)
    setDraftRoot(null)
    setSaveError(null)
    setPendingArrayFocusIndex(null)
    setActiveArrayItemIndex(null)
    arrayItemRefs.current = []
  }

  function beginEditing(rootKey: string, path: string[], value: SettingValue, depth: number) {
    if (!settings) {
      return
    }

    const rootValue = settings[rootKey]
    if (rootValue === undefined) {
      return
    }

    const metadata = getSettingMetadataAtPath(settingsMetadata, [rootKey, ...path])
    const kind = getEditorKind(path, value, depth, metadata)
    const initialValue = buildInitialEditorValue(kind, value)
    setEditing({
      rootKey,
      path,
      kind,
      value: initialValue,
      metadata: metadata ?? undefined,
    })
    setDraftRoot(cloneDeepJson(rootValue))
    setSaveError(null)
  }

  function updateEditingValue(nextValue: string | number | boolean | null | ArrayEditorValue) {
    setEditing((current) => (current ? { ...current, value: nextValue } : current))
    setSaveError(null)
  }

  function updateArrayEditingValue(transform: (items: ArrayEditorValue, kind: ArrayEditorKind) => ArrayEditorValue) {
    setEditing((current) => {
      if (!current || !isArrayEditorKind(current.kind) || !Array.isArray(current.value)) {
        return current
      }

      return {
        ...current,
        value: transform(cloneDeepJson(current.value) as ArrayEditorValue, current.kind),
      }
    })
    setSaveError(null)
  }

  function updateArrayItem(index: number, nextValue: string | number | boolean | null) {
    updateArrayEditingValue((items, kind) => {
      if (kind === 'array-number') {
        const nextItems = [...(items as number[])]
        nextItems[index] = typeof nextValue === 'number' ? nextValue : Number(nextValue ?? 0)
        return nextItems
      }

      if (kind === 'array-boolean') {
        const nextItems = [...(items as boolean[])]
        nextItems[index] = Boolean(nextValue)
        return nextItems
      }

      const nextItems = [...(items as string[])]
      nextItems[index] = String(nextValue ?? '')
      return nextItems
    })
  }

  const isEditingPath = useCallback(
    (rootKey: string, path: string[]) => editing?.rootKey === rootKey && isPathEqual(editing.path, path),
    [editing],
  )

  const filterSettingValue = useCallback(
    (rootKey: string, path: string[], value: SettingValue, depth: number): SettingValue | null => {
      if (!isVisibleLeafValue(value, depth) && isPlainObject(value)) {
        const filteredEntries: Array<readonly [string, SettingValue]> = []

        Object.entries(value).forEach(([childKey, childValue]) => {
          const filteredChild = filterSettingValue(rootKey, [...path, childKey], childValue as SettingValue, depth + 1)
          if (filteredChild !== null) {
            filteredEntries.push([childKey, filteredChild] as const)
          }
        })

        if (filteredEntries.length === 0) {
          return null
        }

        return Object.fromEntries(filteredEntries) as SettingValue
      }

      if (searchTokens.length === 0 || isEditingPath(rootKey, path)) {
        return value
      }

      const label = path[path.length - 1] ?? rootKey
      const fullPath = path.length === 0 ? rootKey : `${rootKey}.${path.join('.')}`
      return matchesSearchTokens(searchTokens, label, fullPath) ? value : null
    },
    [isEditingPath, searchTokens],
  )

  type FilteredEntry = readonly [string, SettingValue]

  const filteredEntries = useMemo<FilteredEntry[]>(() => {
    return entries.reduce<FilteredEntry[]>((result, [rootKey, rootValue]) => {
      const filteredValue = filterSettingValue(rootKey, [], rootValue, 0)
      if (filteredValue !== null) {
        result.push([rootKey, filteredValue] as const)
      }
      return result
    }, [])
  }, [entries, filterSettingValue])

  const showThemeCard = useMemo(() => {
    if (searchTokens.length === 0) {
      return true
    }

    return matchesSearchTokens(searchTokens, '主题模式', 'ui.theme_mode')
  }, [searchTokens])

  const showEmptySearch = searchTokens.length > 0 && filteredEntries.length === 0 && !showThemeCard

  function appendArrayItem() {
    if (!editing || !isArrayEditorKind(editing.kind) || !Array.isArray(editing.value)) {
      return
    }

    const nextIndex = editing.value.length
    updateArrayEditingValue((items, kind) => [...items, createDefaultArrayItem(kind)] as ArrayEditorValue)

    setActiveArrayItemIndex(nextIndex)
    if (editing.kind !== 'array-boolean') {
      setPendingArrayFocusIndex(nextIndex)
    }
  }

  function removeArrayItem(index: number) {
    updateArrayEditingValue((items) => items.filter((_, itemIndex) => itemIndex !== index) as ArrayEditorValue)
    setActiveArrayItemIndex((current) => {
      if (current === null) {
        return current
      }
      if (current === index) {
        return null
      }
      return current > index ? current - 1 : current
    })
  }

  function moveArrayItem(index: number, direction: -1 | 1) {
    updateArrayEditingValue((items) => {
      const targetIndex = index + direction
      if (targetIndex < 0 || targetIndex >= items.length) {
        return items
      }

      const nextItems = [...items]
      ;[nextItems[index], nextItems[targetIndex]] = [nextItems[targetIndex], nextItems[index]]
      return nextItems as ArrayEditorValue
    })
    setActiveArrayItemIndex((current) => {
      if (current === index) {
        return index + direction
      }
      if (current === index + direction) {
        return index
      }
      return current
    })
  }

  const hasUnsavedChanges = useMemo(() => {
    if (!settings || !editing || draftRoot === null) {
      return false
    }

    const originalRoot = settings[editing.rootKey]
    if (originalRoot === undefined) {
      return false
    }

    const originalValue = getValueAtPath<SettingValue>(originalRoot, editing.path)
    if (originalValue === undefined) {
      return false
    }

    try {
      const parsedValue = parseEditorValue(editing.kind, editing.value, originalValue, editing.metadata)
      return JSON.stringify(originalValue) !== JSON.stringify(parsedValue)
    } catch {
      return false
    }
  }, [draftRoot, editing, settings])

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

      const parsedValue = parseEditorValue(editing.kind, editing.value, originalValue, editing.metadata)
      const nextRoot = cloneDeepJson(draftRoot)
      const updatedRoot = setValueAtPath(nextRoot, editing.path, parsedValue)

      await patchSettings({
        [editing.rootKey]: updatedRoot,
      })

      message.success('设置已保存')
      cancelEditing()
    } catch (caughtError) {
      setSaveError(getErrorMessage(caughtError, '设置保存失败'))
    } finally {
      setSaving(false)
    }
  }

  async function saveDirectNumberLeaf(rootKey: string, path: string[], nextValue: number, metadata?: NumericSettingMetadata) {
    if (!settings) {
      return
    }

    const originalRoot = settings[rootKey]
    if (originalRoot === undefined) {
      return
    }

    try {
      setSaving(true)
      setSaveError(null)

      const updatedRoot = setValueAtPath(cloneDeepJson(originalRoot), path, clampNumberValue(nextValue, metadata))
      await patchSettings({
        [rootKey]: updatedRoot,
      })

      message.success('设置已保存')
    } catch (caughtError) {
      setSaveError(getErrorMessage(caughtError, '设置保存失败'))
    } finally {
      setSaving(false)
    }
  }

  async function toggleBooleanLeaf(rootKey: string, path: string[], checked: boolean) {
    if (!settings) {
      return
    }

    const originalRoot = settings[rootKey]
    if (originalRoot === undefined) {
      return
    }

    try {
      setSaving(true)
      setSaveError(null)

      const updatedRoot = setValueAtPath(cloneDeepJson(originalRoot), path, checked)
      await patchSettings({
        [rootKey]: updatedRoot,
      })

      message.success('设置已保存')
    } catch (caughtError) {
      setSaveError(getErrorMessage(caughtError, '设置保存失败'))
    } finally {
      setSaving(false)
    }
  }

  async function handleThemeModeChange(nextThemeMode: 'dark' | 'light' | 'system') {
    try {
      await setThemeMode(nextThemeMode)
      message.success('主题已更新')
    } catch (caughtError) {
      message.error(getErrorMessage(caughtError, '主题切换失败'))
    }
  }

  function renderNumberEditor(
    value: string | number | boolean | null | ArrayEditorValue,
    metadata?: NumericSettingMetadata,
    onValueChange?: (nextValue: number | null) => void,
  ) {
    const currentValue = typeof value === 'number' ? value : null

    if (hasSliderConfig(metadata ?? null)) {
      const sliderMetadata = metadata!
      const { min, max, step } = sliderMetadata
      const handleValueChange = onValueChange ?? ((nextValue: number | null) => updateEditingValue(nextValue))
      return (
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          <Flex align="center" justify="space-between" gap={12}>
            <Typography.Text type="secondary">当前值</Typography.Text>
            <Typography.Text strong>{currentValue === null ? '-' : formatSliderValue(currentValue)}</Typography.Text>
          </Flex>
          <Slider
            min={min}
            max={max}
            step={step}
            value={currentValue ?? min}
            onChange={(nextValue) => handleValueChange(clampNumberValue(nextValue, sliderMetadata))}
            tooltip={{ formatter: (sliderValue) => (typeof sliderValue === 'number' ? formatSliderValue(sliderValue) : '') }}
          />
        </Space>
      )
    }

    return (
      <InputNumber
        value={currentValue}
        onChange={(nextValue) => (onValueChange ?? updateEditingValue)(nextValue)}
        style={{ width: '100%' }}
      />
    )
  }

  function renderEditor() {
    if (!editing) {
      return null
    }

    if (editing.kind === 'number' || editing.kind === 'number-slider') {
      return renderNumberEditor(editing.value, editing.metadata)
    }

    if (isArrayEditorKind(editing.kind)) {
      const items = Array.isArray(editing.value) ? editing.value : []

      return (
        <Space direction="vertical" size="middle" style={{ width: '100%' }} className="settings-array-editor">
          {items.length === 0 ? (
            <Typography.Text type="secondary">当前数组为空，可新增一项开始编辑。</Typography.Text>
          ) : (
            items.map((item, index) => {
              const canMoveUp = index > 0
              const canMoveDown = index < items.length - 1
              const isItemEditing = activeArrayItemIndex === index

              return (
                <div
                  key={index}
                  className={isItemEditing ? 'settings-array-item settings-array-item--active' : 'settings-array-item'}
                  onMouseEnter={() => setActiveArrayItemIndex(index)}
                >
                  <div className="settings-array-item__main">
                    <Typography.Text type="secondary" className="settings-array-item__index">
                      #{index + 1}
                    </Typography.Text>

                    <div className="settings-array-item__input">
                      {editing.kind === 'array-number' ? (
                        <InputNumber
                          ref={undefined}
                          value={typeof item === 'number' ? item : 0}
                          disabled={!isItemEditing}
                          onFocus={() => setActiveArrayItemIndex(index)}
                          onChange={(value) => updateArrayItem(index, value)}
                          style={{ width: '100%' }}
                        />
                      ) : editing.kind === 'array-boolean' ? (
                        <Switch
                          checked={Boolean(item)}
                          disabled={!isItemEditing}
                          onChange={(checked) => updateArrayItem(index, checked)}
                        />
                      ) : (
                        <Input
                          ref={(node) => {
                            arrayItemRefs.current[index] = node
                          }}
                          value={typeof item === 'string' ? item : String(item ?? '')}
                          disabled={!isItemEditing}
                          onFocus={() => setActiveArrayItemIndex(index)}
                          onChange={(event) => updateArrayItem(index, event.target.value)}
                        />
                      )}
                    </div>

                    <Space size="small" className="settings-array-item__inline-actions">
                      <Button
                        size="small"
                        aria-label={isItemEditing ? '取消编辑' : '编辑'}
                        title={isItemEditing ? '取消编辑' : '编辑'}
                        onClick={() => {
                          if (isItemEditing) {
                            setActiveArrayItemIndex(null)
                            return
                          }

                          setActiveArrayItemIndex(index)
                          if (editing.kind !== 'array-boolean') {
                            setPendingArrayFocusIndex(index)
                          }
                        }}
                      >
                        {isItemEditing ? '↺' : '✎'}
                      </Button>
                      <Button size="small" danger aria-label="删除" title="删除" onClick={() => removeArrayItem(index)}>
                        ×
                      </Button>
                    </Space>
                  </div>

                  <Space size="small" className="settings-array-item__move-actions">
                    <Button size="small" aria-label="上移" title="上移" disabled={!canMoveUp} onClick={() => moveArrayItem(index, -1)}>
                      ↑
                    </Button>
                    <Button size="small" aria-label="下移" title="下移" disabled={!canMoveDown} onClick={() => moveArrayItem(index, 1)}>
                      ↓
                    </Button>
                  </Space>
                </div>
              )
            })
          )}

          <Button size="small" onClick={appendArrayItem} style={{ alignSelf: 'flex-start' }}>
            新增一项
          </Button>
        </Space>
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
    const metadata = getSettingMetadataAtPath(settingsMetadata, fullPath)
    const isDirectControl = shouldRenderDirectControl(metadata)
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
        </Flex>

        <div className="settings-tree-leaf__value">
          {typeof value === 'boolean' ? (
            <Switch
              checked={value}
              loading={saving}
              disabled={editing !== null}
              onChange={(checked) => void toggleBooleanLeaf(rootKey, path, checked)}
            />
          ) : isEditingLeaf ? (
            <>
              {isArrayEditorKind(editing.kind) ? (
                <>
                  {renderEditor()}
                  <div className="settings-leaf-footer-actions">
                    <Space>
                      <Button size="small" disabled={saving} onClick={cancelEditing}>
                        取消
                      </Button>
                      <Button type="primary" size="small" loading={saving} disabled={!hasUnsavedChanges} onClick={() => void saveLeaf()}>
                        保存
                      </Button>
                    </Space>
                  </div>
                </>
              ) : (
                <Space.Compact block className="settings-leaf-inline-editor">
                  {renderEditor()}
                  <Button size="small" disabled={saving} onClick={cancelEditing}>
                    取消
                  </Button>
                </Space.Compact>
              )}

              {!isArrayEditorKind(editing.kind) ? (
                <div className="settings-leaf-footer-actions">
                  <Button type="primary" size="small" loading={saving} disabled={!hasUnsavedChanges} onClick={() => void saveLeaf()}>
                    保存
                  </Button>
                </div>
              ) : null}
            </>
          ) : typeof value === 'string' ? (
            <Space.Compact block className="settings-leaf-inline-editor">
              <Input value={value} disabled />
              <Button size="small" disabled={saving || editing !== null} onClick={() => beginEditing(rootKey, path, value, depth)}>
                编辑
              </Button>
            </Space.Compact>
          ) : typeof value === 'number' && isDirectControl ? (
            <>
              {renderNumberEditor(value, metadata ?? undefined, (nextValue) => {
                if (typeof nextValue !== 'number' || saving || editing !== null) {
                  return
                }
                void saveDirectNumberLeaf(rootKey, path, nextValue, metadata ?? undefined)
              })}
            </>
          ) : typeof value === 'number' ? (
            <Space.Compact block className="settings-leaf-inline-editor">
              <InputNumber value={value} disabled style={{ width: '100%' }} />
              <Button size="small" disabled={saving || editing !== null} onClick={() => beginEditing(rootKey, path, value, depth)}>
                编辑
              </Button>
            </Space.Compact>
          ) : Array.isArray(value) ? (
            <>
              <Space direction="vertical" size="small" style={{ width: '100%' }} className="settings-array-readonly">
                {value.map((item, index) => (
                  <div key={index} className="settings-array-readonly-item">
                    <Typography.Text type="secondary" className="settings-array-item__index">
                      #{index + 1}
                    </Typography.Text>
                    <Typography.Text>{typeof item === 'string' ? item || ' ' : String(item)}</Typography.Text>
                  </div>
                ))}
                {value.length === 0 ? <Typography.Text type="secondary">当前数组为空</Typography.Text> : null}
              </Space>
              <div style={{ marginTop: 12 }}>
                <Button size="small" disabled={saving || editing !== null} onClick={() => beginEditing(rootKey, path, value, depth)}>
                  编辑数组
                </Button>
              </div>
            </>
          ) : (
            <>
              {renderReadonlyValue(fullPath, value)}
              <div style={{ marginTop: 12 }}>
                <Button size="small" disabled={saving || editing !== null} onClick={() => beginEditing(rootKey, path, value, depth)}>
                  编辑
                </Button>
              </div>
            </>
          )}
        </div>

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
          <div className="settings-search-bar">
            <Input.Search
              value={searchQuery}
              allowClear
              placeholder="按字段名或完整路径搜索设置，例如 ui.theme_mode"
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>

          {showEmptySearch ? (
            <Card className="settings-card">
              <EmptyState
                title="未找到匹配的设置项"
                description="可尝试搜索字段名或完整路径，例如 ui.theme_mode"
                action={<Button onClick={() => setSearchQuery('')}>清空搜索</Button>}
              />
            </Card>
          ) : null}

          {showThemeCard ? (
            <Card title="界面" className="settings-card" key="ui-preferences">
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <Flex justify="space-between" align="center" wrap="wrap" gap={16}>
                  <div className="settings-tree-leaf__meta">
                    <Typography.Text strong>主题模式</Typography.Text>
                    <Typography.Paragraph type="secondary" className="settings-tree-leaf__path">
                      ui.theme_mode
                    </Typography.Paragraph>
                  </div>
                  <Radio.Group
                    value={themeMode}
                    onChange={(event) => void handleThemeModeChange(event.target.value as 'dark' | 'light' | 'system')}
                    optionType="button"
                    buttonStyle="solid"
                  >
                    <Radio.Button value="dark">深色</Radio.Button>
                    <Radio.Button value="light">浅色</Radio.Button>
                    <Radio.Button value="system">跟随系统</Radio.Button>
                  </Radio.Group>
                </Flex>

                <div className="settings-tree-leaf__value" style={{ marginTop: 0 }}>
                  <Typography.Text type="secondary">主题模式不参与下方设置树的编辑/保存流程。</Typography.Text>
                </div>
              </Space>
            </Card>
          ) : null}

          {filteredEntries.map(([rootKey, rootValue]) => (
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
