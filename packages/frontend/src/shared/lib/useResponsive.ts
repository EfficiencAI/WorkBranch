import { useEffect, useState } from 'react'
import {
  RESPONSIVE_CONFIG,
  type ButtonSize,
  type ComposerConfig,
  type ControlHeight,
  type DeviceType,
  type NavState,
  type ResponsiveDimensions,
} from './responsive'

function getDeviceType(width: number): DeviceType {
  if (width < RESPONSIVE_CONFIG.BREAKPOINTS.MOBILE) return 'mobile'
  if (width < RESPONSIVE_CONFIG.BREAKPOINTS.TABLET) return 'tablet'
  return 'desktop'
}

function calculateUIScale(screenWidth: number): number {
  const scale = screenWidth / RESPONSIVE_CONFIG.BASE_WIDTH
  return Math.max(RESPONSIVE_CONFIG.UI_SCALE.MIN, Math.min(RESPONSIVE_CONFIG.UI_SCALE.MAX, scale))
}

function calculateNavWidth(screenWidth: number, state: NavState): number {
  if (screenWidth < RESPONSIVE_CONFIG.BREAKPOINTS.MOBILE) {
    return screenWidth * RESPONSIVE_CONFIG.MOBILE_DRAWER.WIDTH_RATIO
  }

  if (screenWidth < RESPONSIVE_CONFIG.BREAKPOINTS.TABLET) {
    const scale = screenWidth / RESPONSIVE_CONFIG.BASE_WIDTH
    switch (state) {
      case 'collapsed':
        return RESPONSIVE_CONFIG.NAV_WIDTH.COLLAPSED
      case 'peek':
        return Math.floor(RESPONSIVE_CONFIG.NAV_WIDTH.PEEK * scale)
      case 'open':
        return Math.floor(RESPONSIVE_CONFIG.NAV_WIDTH.OPEN * scale)
    }
  }

  const stateKey = state.toUpperCase() as keyof typeof RESPONSIVE_CONFIG.NAV_WIDTH
  return RESPONSIVE_CONFIG.NAV_WIDTH[stateKey]
}

function calculateComposerHeight(screenWidth: number): ComposerConfig {
  if (screenWidth < RESPONSIVE_CONFIG.BREAKPOINTS.MOBILE) {
    const config = RESPONSIVE_CONFIG.COMPOSER.MOBILE
    return {
      textareaRows: config.TEXTAREA_ROWS,
      minHeight: config.MIN_HEIGHT,
      buttonSize: config.BUTTON_SIZE,
    }
  } else if (screenWidth < RESPONSIVE_CONFIG.BREAKPOINTS.TABLET) {
    const config = RESPONSIVE_CONFIG.COMPOSER.TABLET
    return {
      textareaRows: config.TEXTAREA_ROWS,
      minHeight: config.MIN_HEIGHT,
      buttonSize: config.BUTTON_SIZE,
    }
  }
  const config = RESPONSIVE_CONFIG.COMPOSER.DESKTOP
  return {
    textareaRows: config.TEXTAREA_ROWS,
    minHeight: config.MIN_HEIGHT,
    buttonSize: config.BUTTON_SIZE,
  }
}

function calculateControlHeight(screenWidth: number): ControlHeight {
  if (screenWidth < RESPONSIVE_CONFIG.BREAKPOINTS.MOBILE) {
    return {
      normal: Math.max(RESPONSIVE_CONFIG.TOUCH_TARGET.MIN_SIZE, RESPONSIVE_CONFIG.CONTROL_HEIGHT.NORMAL),
      large: Math.max(RESPONSIVE_CONFIG.TOUCH_TARGET.MIN_SIZE + 8, RESPONSIVE_CONFIG.CONTROL_HEIGHT.LARGE),
    }
  }

  return {
    normal: RESPONSIVE_CONFIG.CONTROL_HEIGHT.NORMAL,
    large: RESPONSIVE_CONFIG.CONTROL_HEIGHT.LARGE,
  }
}

export function useResponsive() {
  const [dimensions, setDimensions] = useState<ResponsiveDimensions>(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : RESPONSIVE_CONFIG.BASE_WIDTH,
    height: typeof window !== 'undefined' ? window.innerHeight : 768,
    deviceType: typeof window !== 'undefined' ? getDeviceType(window.innerWidth) : 'desktop',
    uiScale: typeof window !== 'undefined' ? calculateUIScale(window.innerWidth) : RESPONSIVE_CONFIG.UI_SCALE.MAX,
  }))

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth
      setDimensions({
        width,
        height: window.innerHeight,
        deviceType: getDeviceType(width),
        uiScale: calculateUIScale(width),
      })
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return {
    ...dimensions,
    isMobile: dimensions.deviceType === 'mobile',
    isTablet: dimensions.deviceType === 'tablet',
    isDesktop: dimensions.deviceType === 'desktop',
    navWidth: {
      collapsed: calculateNavWidth(dimensions.width, 'collapsed'),
      peek: calculateNavWidth(dimensions.width, 'peek'),
      open: calculateNavWidth(dimensions.width, 'open'),
    },
    composerConfig: calculateComposerHeight(dimensions.width),
    controlHeight: calculateControlHeight(dimensions.width),
  }
}

export function useBreakpoint(): {
  isMobile: boolean
  isTablet: boolean
  isDesktop: boolean
  deviceType: DeviceType
} {
  const { deviceType, isMobile, isTablet, isDesktop } = useResponsive()
  return { deviceType, isMobile, isTablet, isDesktop }
}

export function getButtonSize(screenWidth: number): ButtonSize {
  if (screenWidth < RESPONSIVE_CONFIG.BREAKPOINTS.MOBILE) {
    return RESPONSIVE_CONFIG.COMPOSER.MOBILE.BUTTON_SIZE
  } else if (screenWidth < RESPONSIVE_CONFIG.BREAKPOINTS.TABLET) {
    return RESPONSIVE_CONFIG.COMPOSER.TABLET.BUTTON_SIZE
  }
  return RESPONSIVE_CONFIG.COMPOSER.DESKTOP.BUTTON_SIZE
}
