import { useCallback, useRef } from 'react'

type LongPressOptions = {
  threshold?: number
  onStart?: () => void
  onCancel?: () => void
  onFinish?: () => void
}

type LongPressHandlers = {
  onTouchStart: (e: React.TouchEvent) => void
  onTouchEnd: () => void
  onTouchMove: () => void
  onMouseDown: (e: React.MouseEvent) => void
  onMouseUp: () => void
  onMouseLeave: () => void
}

export function useLongPress(
  callback: (e: React.TouchEvent | React.MouseEvent) => void,
  options: LongPressOptions = {}
): LongPressHandlers {
  const { threshold = 500, onStart, onCancel, onFinish } = options
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isLongPressActive = useRef(false)

  const start = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      isLongPressActive.current = false
      onStart?.()
      
      timerRef.current = setTimeout(() => {
        isLongPressActive.current = true
        callback(e)
        onFinish?.()
      }, threshold)
    },
    [callback, threshold, onStart, onFinish]
  )

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    
    if (!isLongPressActive.current) {
      onCancel?.()
    }
  }, [onCancel])

  return {
    onTouchStart: (e: React.TouchEvent) => start(e),
    onTouchEnd: clear,
    onTouchMove: clear,
    onMouseDown: (e: React.MouseEvent) => start(e),
    onMouseUp: clear,
    onMouseLeave: clear,
  }
}
