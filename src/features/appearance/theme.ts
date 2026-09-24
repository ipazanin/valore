import { onScopeDispose, readonly, ref, watch, type Ref } from 'vue'
import type { ThemePreference } from '../portfolio/domain/types'

export type ResolvedTheme = 'light' | 'dark'

const currentTheme = ref<ResolvedTheme>('light')
export const resolvedTheme = readonly(currentTheme)

export function applyTheme(preference: Readonly<Ref<ThemePreference | undefined>>): void {
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)')
  const update = () => {
    const selected = preference.value ?? 'system'
    currentTheme.value = selected === 'system' ? (systemDark.matches ? 'dark' : 'light') : selected
    document.documentElement.dataset.theme = currentTheme.value
  }

  watch(preference, update, { immediate: true })
  systemDark.addEventListener('change', update)
  onScopeDispose(() => systemDark.removeEventListener('change', update))
}
