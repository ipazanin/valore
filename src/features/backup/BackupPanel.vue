<script setup lang="ts">
import { computed, ref } from 'vue'
import { usePortfolioStore } from '../portfolio/application/store'
import { calculateOverview, latestObservation } from '../portfolio/domain/calculations'
import { formatMoney } from '../portfolio/domain/format'
import { localToday } from '../portfolio/domain/dates'
import { parseBackup, type Backup } from './backup'

const props = defineProps<{ onboarding?: boolean }>()
const emit = defineEmits<{ restored: [] }>()
const store = usePortfolioStore()
const backup = ref<Backup>()
const fileInput = ref<HTMLInputElement>()
const filename = ref('')
const error = ref('')
const message = ref('')
const reading = ref(false)
const confirmed = ref(false)
const preview = computed(() => (backup.value ? calculateOverview(backup.value.portfolio) : null))
const unobservedCount = computed(() => {
  const portfolio = backup.value?.portfolio
  if (!portfolio) return 0
  return (
    portfolio.accounts.filter((account) => !latestObservation(portfolio, 'cash', account.id))
      .length +
    portfolio.holdings.filter((holding) => !latestObservation(portfolio, 'quantity', holding.id))
      .length +
    portfolio.records.filter((record) => !latestObservation(portfolio, 'valuation', record.id))
      .length
  )
})
async function selectFile(event: Event) {
  backup.value = undefined
  confirmed.value = false
  error.value = ''
  message.value = ''
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  reading.value = true
  try {
    if (file.size > 10 * 1024 * 1024) throw new Error('Choose a backup smaller than 10 MB.')
    const validated = parseBackup(await file.text())
    backup.value = validated
    filename.value = file.name
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : 'This backup could not be read.'
  } finally {
    reading.value = false
  }
}
function cancel() {
  backup.value = undefined
  confirmed.value = false
  if (fileInput.value) fileInput.value.value = ''
  fileInput.value?.focus()
}
async function restore() {
  if (!backup.value || !confirmed.value) return
  error.value = ''
  try {
    await store.restore(backup.value)
    backup.value = undefined
    confirmed.value = false
    if (fileInput.value) fileInput.value.value = ''
    message.value = 'Backup restored. Your portfolio is saved in this browser.'
    emit('restored')
  } catch (failure) {
    error.value =
      failure instanceof Error
        ? failure.message
        : 'Restore failed. Your existing portfolio has been kept.'
  }
}
async function exportFile() {
  error.value = ''
  try {
    const json = await store.exportJson()
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `valore-backup-${localToday()}.json`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    message.value =
      'Backup download requested. Check that the JSON file was saved, and keep a copy somewhere safe.'
  } catch (failure) {
    error.value =
      failure instanceof Error
        ? failure.message
        : 'The backup could not be exported. Please try again.'
  }
}
</script>

<template>
  <section class="stack" :aria-labelledby="props.onboarding ? 'restore-title' : 'backup-title'">
    <div v-if="!onboarding" class="section-heading">
      <div>
        <h1 id="backup-title">Keep a copy</h1>
        <p class="muted">Your records stay with you. Make regular backups.</p>
      </div>
    </div>
    <article v-if="!onboarding" class="card export-card">
      <div>
        <h2>Export your portfolio</h2>
        <p class="muted">
          Download all accounts, investments, assets, debts, dated observations, and your currency
          setting in one versioned JSON file.
        </p>
        <small>The file is unencrypted. Store it somewhere private.</small>
      </div>
      <button :disabled="store.saving" @click="exportFile">Export backup</button>
    </article>
    <article class="card">
      <h2 id="restore-title">Restore a backup</h2>
      <p class="muted">
        Choose a Valore JSON backup. You’ll see a preview before confirming{{
          onboarding ? '.' : ' replacement of your current portfolio.'
        }}
      </p>
      <div class="field">
        <label for="backup-file">Backup file</label
        ><input
          id="backup-file"
          ref="fileInput"
          type="file"
          accept=".json,application/json"
          :disabled="reading || store.saving"
          @change="selectFile"
        />
      </div>
      <p v-if="reading" role="status">Reading and validating the complete backup…</p>
      <div v-if="backup && preview" class="preview">
        <p class="eyebrow">Validated backup · Version {{ backup.version }}</p>
        <h3>{{ filename }}</h3>
        <p class="muted">Exported {{ new Date(backup.exportedAt).toLocaleString('en') }}</p>
        <dl class="preview-details">
          <div>
            <dt>Currency</dt>
            <dd>{{ backup.portfolio.settings.reportingCurrency }}</dd>
          </div>
          <div>
            <dt>Accounts</dt>
            <dd>{{ backup.portfolio.accounts.length }}</dd>
          </div>
          <div>
            <dt>Investment holdings</dt>
            <dd>{{ backup.portfolio.holdings.length }}</dd>
          </div>
          <div>
            <dt>Assets & debts</dt>
            <dd>{{ backup.portfolio.records.length }}</dd>
          </div>
          <div>
            <dt>Dated observations</dt>
            <dd>{{ backup.portfolio.observations.length }}</dd>
          </div>
          <div>
            <dt>{{ preview.incomplete ? 'Known net worth · Incomplete' : 'Net worth' }}</dt>
            <dd class="amount">
              {{ formatMoney(preview.netWorth, backup.portfolio.settings.reportingCurrency) }}
            </dd>
          </div>
        </dl>
        <p v-if="unobservedCount" class="notice">
          {{ unobservedCount }} record(s) have no observation and are excluded from recorded totals.
        </p>
        <p v-if="preview.incomplete" class="notice warning">
          {{ preview.unvaluedHoldings.length }} holding(s) have no price. Known totals are
          incomplete.
        </p>
        <p class="notice warning">
          {{
            store.portfolio
              ? 'This replaces every current record and the currency setting. Export your current portfolio first if you want to keep it.'
              : 'This restores the complete portfolio and its saved currency setting.'
          }}
        </p>
        <label class="confirmation"
          ><input v-model="confirmed" type="checkbox" :disabled="store.saving" />
          <span>{{
            store.portfolio
              ? 'I understand that this will replace my current portfolio.'
              : 'I want to restore this portfolio.'
          }}</span></label
        >
        <div class="actions">
          <button :disabled="!confirmed || store.saving" @click="restore">
            {{
              store.saving
                ? 'Restoring…'
                : store.portfolio
                  ? 'Replace portfolio'
                  : 'Restore portfolio'
            }}</button
          ><button class="secondary" :disabled="store.saving" @click="cancel">Cancel</button>
        </div>
      </div>
    </article>
    <p v-if="error" class="error" role="alert">
      {{ error }} Existing records have not been replaced.
    </p>
    <p v-if="message" class="notice" role="status">{{ message }}</p>
    <p v-if="!onboarding" class="storage-note muted">
      Browser storage is not a backup. Clearing site data, private browsing, or storage eviction can
      remove local records. Restore a saved backup to move your portfolio to another browser or
      device.
    </p>
  </section>
</template>

<style scoped>
.export-card {
  display: flex;
  gap: 2rem;
  align-items: center;
  justify-content: space-between;
}
.export-card p {
  margin-bottom: 0.6rem;
}
.export-card button {
  flex-shrink: 0;
}
.preview {
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--line);
}
.preview h3 {
  overflow-wrap: anywhere;
}
.preview-details {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}
.preview-details dt {
  font-size: 0.85rem;
  color: var(--muted);
}
.preview-details dd {
  margin: 0.3rem 0 0;
  font-weight: 600;
}
.confirmation {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  margin-block: 1rem;
  font-size: 0.9rem;
  line-height: 1.5;
}
.confirmation input {
  width: 20px;
  min-width: 20px;
  accent-color: var(--brand);
}
input[type='file'] {
  padding: 0.5rem;
  font-size: 0.85rem;
}
input::file-selector-button {
  padding: 0.5rem;
  border: 1px solid var(--line);
  border-radius: 5px;
  background: var(--tint);
  margin-right: 0.5rem;
  color: var(--ink);
}
.storage-note {
  font-size: 0.85rem;
}
@media (max-width: 650px) {
  .export-card {
    flex-direction: column;
    align-items: stretch;
    gap: 1rem;
  }
}
</style>
