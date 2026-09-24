<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { usePortfolioStore } from '../application/store'
import { localToday } from '../domain/dates'
import type { Observation, ObservationKind } from '../domain/types'

const props = defineProps<{
  kind: ObservationKind
  subjectId: string
  subjectLabel: string
  initialDate: string
  observation?: Observation
}>()
const emit = defineEmits<{ done: []; cancel: [] }>()
const store = usePortfolioStore()
const expectedPortfolioEpoch = store.portfolioEpoch ?? ''
const effectiveDate = ref(props.observation?.effectiveDate ?? props.initialDate)
const amount = ref(props.observation?.amount ?? '')
const error = ref('')
const dateInput = ref<HTMLInputElement>()

const amountLabels: Record<ObservationKind, string> = {
  cash: 'Cash balance',
  quantity: 'Total quantity',
  price: 'Unit price',
  valuation: 'Value',
}

onMounted(() => dateInput.value?.focus())

async function save() {
  error.value = ''
  try {
    await store.saveObservation({
      id: props.observation?.id,
      kind: props.kind,
      subjectId: props.subjectId,
      effectiveDate: effectiveDate.value,
      amount: amount.value,
      expectedPortfolioEpoch,
    })
    emit('done')
  } catch (failure) {
    error.value =
      failure instanceof Error ? failure.message : 'The observation could not be saved.'
  }
}
</script>

<template>
  <form class="card editor" aria-labelledby="observation-form-title" @submit.prevent="save">
    <h3 id="observation-form-title">{{ observation ? 'Edit observation' : 'Add observation' }}</h3>
    <p class="muted">{{ subjectLabel }}</p>
    <div class="form-grid">
      <div class="field">
        <label for="observation-date">Effective date</label>
        <input
          id="observation-date"
          ref="dateInput"
          v-model="effectiveDate"
          type="date"
          required
          :max="localToday()"
        />
      </div>
      <div class="field">
        <label for="observation-amount">{{ amountLabels[kind] }}</label>
        <input
          id="observation-amount"
          v-model="amount"
          required
          inputmode="text"
          maxlength="32"
          placeholder="0.00"
          aria-describedby="observation-amount-hint"
        />
        <small id="observation-amount-hint">
          Use a decimal point without separators.
          {{ kind === 'cash' ? 'Negative balances are allowed.' : 'Enter zero when the amount is zero.' }}
        </small>
      </div>
    </div>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <div class="actions">
      <button type="submit" :disabled="store.saving">
        {{ store.saving ? 'Saving…' : 'Save observation' }}
      </button>
      <button type="button" class="secondary" :disabled="store.saving" @click="emit('cancel')">
        Cancel
      </button>
    </div>
  </form>
</template>

<style scoped>
.editor .actions {
  margin-top: 1.25rem;
}
</style>
