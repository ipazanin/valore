<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { usePortfolioStore } from '../application/store'
import type { AssetRecord } from '../domain/types'
import { latestObservation } from '../domain/calculations'
import { formatMoney } from '../domain/format'
import { recordCategories, displayDate } from './labels'
import RecordForm from './RecordForm.vue'

const store = usePortfolioStore()
const formOpen = ref(false)
const editingRecord = ref<AssetRecord>()
const message = ref('')
const heading = ref<HTMLElement>()
const currency = computed(() => store.portfolio?.settings.reportingCurrency ?? '')
const records = computed(() =>
  (store.portfolio?.records ?? []).map((record) => ({
    ...record,
    observation: latestObservation(store.portfolio!, 'valuation', record.id),
  })),
)
function openRecord(record?: AssetRecord) {
  editingRecord.value = record
  formOpen.value = true
  message.value = ''
}
async function closeForm(saved = false) {
  formOpen.value = false
  if (saved) message.value = 'Saved in this browser.'
  await nextTick()
  heading.value?.focus()
}
</script>

<template>
  <section aria-labelledby="records-title" class="stack">
    <div class="section-heading">
      <div>
        <h1 id="records-title" ref="heading" tabindex="-1">Assets & debts</h1>
        <p class="muted">What you own, what you’ve lent, and what you owe.</p>
      </div>
      <button v-if="!formOpen" @click="openRecord()">+ Add record</button>
    </div>
    <p v-if="message" role="status" class="notice">{{ message }}</p>
    <RecordForm
      v-if="formOpen"
      :key="editingRecord?.id ?? 'new'"
      :record="editingRecord"
      @done="closeForm(true)"
      @cancel="closeForm()"
    />
    <div v-if="!records.length && !formOpen" class="empty">
      <h2>The rest of your financial picture</h2>
      <p>Add property, a vehicle, other possessions, money lent, or an outstanding debt.</p>
      <button class="secondary" @click="openRecord()">Add your first record</button>
    </div>
    <div v-if="records.length" class="card record-list">
      <article v-for="record in records" :key="record.id" class="record">
        <div class="description">
          <span class="badge">{{ recordCategories[record.category] }}</span>
          <h2>{{ record.name }}</h2>
          <small v-if="record.observation"
            >{{
              record.category === 'debt' || record.category === 'lent'
                ? 'Outstanding'
                : 'Resale estimate'
            }}
            · {{ displayDate(record.observation.effectiveDate) }}</small
          >
        </div>
        <div class="record-end">
          <strong class="amount" :class="{ debt: record.category === 'debt' }">{{
            record.observation ? formatMoney(record.observation.amount, currency) : 'No observation'
          }}</strong
          ><button
            class="quiet"
            :disabled="store.saving"
            :aria-label="`Update ${record.name}`"
            @click="openRecord(record)"
          >
            Update
          </button>
        </div>
      </article>
    </div>
    <p v-if="records.length" class="muted footnote">
      Update a dated estimate or outstanding amount at any time. Use History to correct or delete
      observations. Records without observations have no recorded value.
    </p>
  </section>
</template>

<style scoped>
.record-list {
  padding-block: 0;
}
.record {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding-block: 1.3rem;
}
.record + .record {
  border-top: 1px solid var(--line);
}
.description {
  min-width: 0;
}
.record h2 {
  margin-top: 0.5rem;
  margin-bottom: 0.35rem;
  overflow-wrap: anywhere;
}
.record-end {
  display: flex;
  align-items: center;
  gap: 1rem;
  text-align: right;
}
.debt {
  color: var(--danger);
}
.footnote {
  font-size: 0.85rem;
}
@media (max-width: 600px) {
  .record {
    align-items: flex-start;
    flex-direction: column;
  }
  .record-end {
    width: 100%;
    justify-content: space-between;
  }
}
</style>
