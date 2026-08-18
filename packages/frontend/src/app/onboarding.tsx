import { useCallback, useContext, useMemo, useState } from 'react'
import type { PropsWithChildren } from 'react'
import { createContext } from 'react'
import { useSettings } from './settings'

const ONBOARDING_COMPLETED_KEY = 'wb_onboarding_completed'
const ONBOARDING_SKIPPED_KEY = 'wb_onboarding_skipped'

export type OnboardingStep = 'api_key' | 'base_url' | 'model'

type OnboardingContextValue = {
  visible: boolean
  currentStep: OnboardingStep
  closeSignal: number
  showOnboarding: () => void
  completeOnboarding: () => void
  skipOnboarding: () => void
  goToStep: (step: OnboardingStep) => void
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null)

function isLlmConfigured(settings: ReturnType<typeof useSettings>['settings']): boolean {
  if (!settings || typeof settings !== 'object') return false
  const llm = settings.llm
  if (!llm || typeof llm !== 'object' || Array.isArray(llm)) return false
  const apiKey = (llm as Record<string, unknown>).api_key
  const baseUrl = (llm as Record<string, unknown>).base_url
  const model = (llm as Record<string, unknown>).model
  return typeof apiKey === 'string' && apiKey.length > 0
    && typeof baseUrl === 'string' && baseUrl.length > 0
    && typeof model === 'string' && model.length > 0
}

function getStorageBool(key: string, fallback: boolean): boolean {
  try {
    const val = localStorage.getItem(key)
    return val === null ? fallback : val === 'true'
  } catch {
    return fallback
  }
}

export function OnboardingProvider({ children }: PropsWithChildren) {
  const { settings, loading } = useSettings()
  const [forcedVisible, setForcedVisible] = useState(false)
  const [step, setStep] = useState<OnboardingStep>('api_key')
  const [completed, setCompleted] = useState(() => getStorageBool(ONBOARDING_COMPLETED_KEY, false))
  const [skipped, setSkipped] = useState(() => getStorageBool(ONBOARDING_SKIPPED_KEY, false))
  const [closeSignal, setCloseSignal] = useState(0)
  const configured = isLlmConfigured(settings)

  const shouldShow = !loading && !completed && !skipped && !configured
  const visible = forcedVisible || shouldShow

  const showOnboarding = useCallback(() => setForcedVisible(true), [])
  const hideForced = useCallback(() => setForcedVisible(false), [])

  const completeOnboarding = useCallback(() => {
    localStorage.setItem(ONBOARDING_COMPLETED_KEY, 'true')
    localStorage.removeItem(ONBOARDING_SKIPPED_KEY)
    setCompleted(true)
    setSkipped(false)
    hideForced()
    setCloseSignal((signal) => signal + 1)
  }, [hideForced])

  const skipOnboarding = useCallback(() => {
    localStorage.setItem(ONBOARDING_SKIPPED_KEY, 'true')
    setSkipped(true)
    hideForced()
    setCloseSignal((signal) => signal + 1)
  }, [hideForced])

  const goToStep = useCallback((s: OnboardingStep) => setStep(s), [])

  const value = useMemo<OnboardingContextValue>(
    () => ({ visible, currentStep: step, closeSignal, showOnboarding, completeOnboarding, skipOnboarding, goToStep }),
    [visible, step, closeSignal, showOnboarding, completeOnboarding, skipOnboarding, goToStep],
  )

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- OnboardingProvider and useOnboarding intentionally share one module
export function useOnboarding() {
  const ctx = useContext(OnboardingContext)
  if (!ctx) throw new Error('useOnboarding must be used within OnboardingProvider')
  return ctx
}
