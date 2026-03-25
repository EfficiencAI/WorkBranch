export type SettingPrimitive = string | number | boolean | null

export type SettingValue = SettingPrimitive | SettingNode | SettingValue[]

export interface SettingNode {
  [key: string]: SettingValue
}

export type SettingsResponseData = SettingNode
