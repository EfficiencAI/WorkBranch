export const RESPONSIVE_CONFIG = {
  BREAKPOINTS: {
    MOBILE: 768,
    TABLET: 1024,
    DESKTOP: 1024,
  },

  BASE_WIDTH: 1440,

  UI_SCALE: {
    MIN: 0.75,
    MAX: 1.0,
  },

  FONT_SIZE: {
    MIN_MOBILE: 14,
  },

  TOUCH_TARGET: {
    MIN_SIZE: 44,
  },

  SPACING: {
    MOBILE_REDUCTION: 0.85,
    TABLET_REDUCTION: 0.92,
  },

  NAV_WIDTH: {
    COLLAPSED: 58,
    PEEK: 332,
    OPEN: 372,
  },

  MOBILE_DRAWER: {
    WIDTH_RATIO: 0.85,
  },

  COMPOSER: {
    MOBILE: {
      TEXTAREA_ROWS: 4,
      MIN_HEIGHT: 96,
      BUTTON_SIZE: 'large' as const,
    },
    TABLET: {
      TEXTAREA_ROWS: 3,
      MIN_HEIGHT: 80,
      BUTTON_SIZE: 'middle' as const,
    },
    DESKTOP: {
      TEXTAREA_ROWS: 3,
      MIN_HEIGHT: 76,
      BUTTON_SIZE: 'small' as const,
    },
  },

  CONTROL_HEIGHT: {
    NORMAL: 40,
    LARGE: 48,
  },

  BORDER_RADIUS: {
    MOBILE_FACTOR: 0.8,
  },
} as const

export type DeviceType = 'mobile' | 'tablet' | 'desktop'

export type NavState = 'collapsed' | 'peek' | 'open'

export type ButtonSize = 'small' | 'middle' | 'large'

export interface ResponsiveDimensions {
  width: number
  height: number
  deviceType: DeviceType
  uiScale: number
}

export interface ComposerConfig {
  textareaRows: number
  minHeight: number
  buttonSize: ButtonSize
}

export interface ControlHeight {
  normal: number
  large: number
}
