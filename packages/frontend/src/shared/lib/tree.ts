export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function cloneDeepJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function getValueAtPath<TValue = unknown>(root: unknown, path: string[]) {
  let current = root

  for (const segment of path) {
    if (!isPlainObject(current) || !(segment in current)) {
      return undefined
    }

    current = current[segment]
  }

  return current as TValue | undefined
}

export function setValueAtPath<TValue>(root: TValue, path: string[], nextValue: unknown): TValue {
  if (path.length === 0) {
    return nextValue as TValue
  }

  if (!isPlainObject(root)) {
    return root
  }

  const target = root as Record<string, unknown>
  const [head, ...rest] = path

  if (rest.length === 0) {
    target[head] = nextValue
    return root
  }

  const child = target[head]
  if (!isPlainObject(child)) {
    return root
  }

  target[head] = setValueAtPath(child, rest, nextValue)
  return root
}
