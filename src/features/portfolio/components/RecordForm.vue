<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { usePortfolioStore } from '../application/store'
import type { AssetRecord, RecordCategory } from '../domain/types'
import { latestObservation } from '../domain/calculations'
import { recordCategories } from './labels'

const props = defineProps<{ record?: AssetRecord }>()
const emit = defineEmits<{ done: []; cancel: [] }>()
const store = usePortfolioStore()
const expectedPortfolioEpoch = store.portfolioEpoch ?? ''
const name = ref(props.record?.name ?? '')
const category = ref<RecordCategory>(props.record?.category ?? 'property')
const amount = ref(
  props.record && store.portfolio
    ? (latestObservation(store.portfolio, 'valuation', props.record.id)?.amount ?? '')
    : '',
)
const amountLabel = computed(() =>
  category.value === 'debt' || category.value === 'lent'
    ? 'Outstanding amount'
    : 'Current resale estimate',
)
const error = ref('')
const nameInput = ref<HTMLInputElement>()
onMounted(() => nameInput.value?.focus())
async function save() {
  error.value = ''
  try {
    await store.saveRecord({
      expectedPortfolioEpoch,
      id: props.record?.id,
      name: name.value,
      category: category.value,
      amount: amount.value,
    })
    emit('done')
  } catch (failure) {
    error.value =
      failure instanceof Error
        ? failure.message
        : 'The record could not be saved. Please try again.'
  }
}
</script>

<template>
  <form class="card editor" aria-labelledby="record-form-title" @submit.prevent="save">
    <h2 id="record-form-title">{{ record ? 'Update record' : 'Add an asset or debt' }}</h2>
    <p class="muted">
      Record today’s value in {{ store.portfolio?.settings.reportingCurrency }}. Keep property and
      its mortgage as separate records.
    </p>
    <div class="form-grid">
      <div class="field">
        <label for="record-name">Record name</label>
        <input
          id="record-name"
          ref="nameInput"
          v-model="name"
          required
          maxlength="120"
          placeholder="e.g. Home, car or mortgage"
          autocomplete="off"
        />
      </div>
      <div class="field">
        <label for="record-category">Category</label>
        <select id="record-category" v-model="category" :disabled="Boolean(record)">
          <option v-for="(label, key) in recordCategories" :key="key" :value="key">
            {{ label }}
          </option>
        </select>
      </div>
      <div class="field full-width">
        <label for="record-amount"
          >{{ amountLabel }} ({{ store.portfolio?.settings.reportingCurrency }})</label
        >
        <input
          id="record-amount"
          v-model="amount"
          required
          inputmode="decimal"
          maxlength="31"
          placeholder="0.00"
          aria-describedby="record-amount-hint"
        />
        <small id="record-amount-hint"
          >{{
            category === 'debt'
              ? 'Enter what you still owe as a positive amount.'
              : category === 'lent'
                ? 'Enter what is still owed to you, as a positive amount.'
                : 'Use what you could sell it for today, rather than its original cost.'
          }}
          Use a decimal point, without separators.</small
        >
      </div>
    </div>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <div class="actions">
      <button :disabled="store.saving" type="submit">
        {{ store.saving ? 'Saving…' : 'Save record' }}
      </button>
      <button :disabled="store.saving" type="button" class="secondary" @click="emit('cancel')">
        Cancel
      </button>
    </div>
  </form>
</template>

<style scoped>
.error {
  margin-top: 1rem;
  margin-bottom: 0;
}
</style>
