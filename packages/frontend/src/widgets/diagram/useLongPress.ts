import { useCallback, useRef } from 'react'

type LongPressOptions = {
  threshold?: number
  moveThreshold?: number
  onStart?: () => void
  onCancel?: () => void
  onFinish?: () => void
}

type LongPressHandlers = {
  onTouchStart: (e: React.TouchEvent) => void
  onTouchEnd: () => void
  onTouchMove: (e: React.TouchEvent) => void
  onMouseDown: (e: React.MouseEvent) => void
  onMouseUp: () => void
  onMouseLeave: () => void
  onMouseMove: (e: React.MouseEvent) => void
}

export function useLongPress(
  callback: (e: React.TouchEvent | React.MouseEvent) => void,
  options: LongPressOptions = {}
): LongPressHandlers {
  const { threshold = 500, moveThreshold = 10, onStart, onCancel, onFinish } = options
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isLongPressActive = useRef(false)
  const startPosRef = useRef<{ x: number; y: number } | null>(null)

  const start = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      isLongPressActive.current = false
      const clientX = 'touches' in e ? e.touches[0]?.clientX ?? 0 : e.clientX
      const clientY = 'touches' in e ? e.touches[0]?.clientY ?? 0 : e.clientY
      startPosRef.current = { x: clientX, y: clientY }
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
    startPosRef.current = null
    
    if (!isLongPressActive.current) {
      onCancel?.()
    }
  }, [onCancel])

  const handleMove = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      if (!startPosRef.current) return
      
      const clientX = 'touches' in e ? e.touches[0]?.clientX ?? 0 : e.clientX
      const clientY = 'touches' in e ? e.touches[0]?.clientY ?? 0 : e.clientY
      
      const deltaX = Math.abs(clientX - startPosRef.current.x)
      const deltaY = Math.abs(clientY - startPosRef.current.y)
      
      if (deltaX > moveThreshold || deltaY > moveThreshold) {
        clear()
      }
    },
    [moveThreshold, clear]
  )

  return {
    onTouchStart: (e: React.TouchEvent) => start(e),
    onTouchEnd: clear,
    onTouchMove: handleMove,
    onMouseDown: (e: React.MouseEvent) => start(e),
    onMouseUp: clear,
    onMouseLeave: clear,
    onMouseMove: handleMove,
  }
}
