<script setup lang="ts">
import { ref, watch } from 'vue'
import { usePortfolioStore } from '../portfolio/application/store'
import type { ThemePreference } from '../portfolio/domain/types'

const store = usePortfolioStore()
const selected = ref<ThemePreference>('system')
const pending = ref(false)
const error = ref('')

watch(
  () => store.portfolio?.settings.theme,
  (saved) => {
    if (!pending.value) selected.value = saved ?? 'system'
  },
  { immediate: true },
)

async function save() {
  error.value = ''
  pending.value = true
  try {
    await store.saveTheme(selected.value)
  } catch (failure) {
    selected.value = store.portfolio?.settings.theme ?? 'system'
    error.value = failure instanceof Error ? failure.message : 'The theme could not be saved.'
  } finally {
    pending.value = false
    selected.value = store.portfolio?.settings.theme ?? 'system'
  }
}
</script>

<template>
  <div class="theme-control">
    <label for="theme-preference">Appearance</label>
    <select
      id="theme-preference"
      v-model="selected"
      :disabled="pending || store.saving"
      @change="save"
    >
      <option value="system">Follow system</option>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
    </select>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
  </div>
</template>

<style scoped>
.theme-control {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  min-width: 0;
}
.theme-control label {
  color: var(--muted);
  font-size: 0.8rem;
  font-weight: 600;
}
.theme-control select {
  min-width: 9rem;
  min-height: 44px;
  padding: 0.5rem 0.7rem;
  border: 1px solid var(--field-border);
  border-radius: 8px;
  color: var(--ink);
  background: var(--surface);
}
.theme-control .error {
  width: 100%;
  margin: 0;
}
</style>
