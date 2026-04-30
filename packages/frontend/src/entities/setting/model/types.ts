export type SettingPrimitive = string | number | boolean | null

export type SettingControlType = 'slider'

export interface NumericSettingMetadata {
  type: 'number'
  control?: SettingControlType
  min?: number
  max?: number
  step?: number
}

export interface SettingMetadataNode {
  [key: string]: NumericSettingMetadata | SettingMetadataNode
}

export type SettingValue = SettingPrimitive | SettingNode | SettingValue[]

export interface SettingNode {
  [key: string]: SettingValue
}

export type SettingsResponseData = SettingNode
export type SettingsMetadataResponseData = SettingMetadataNode
