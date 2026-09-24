<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { usePortfolioStore } from '../application/store'
import type { Account } from '../domain/types'
import { latestObservation } from '../domain/calculations'

const props = defineProps<{ account?: Account }>()
const emit = defineEmits<{ done: []; cancel: [] }>()
const store = usePortfolioStore()
const expectedPortfolioEpoch = store.portfolioEpoch ?? ''
const name = ref(props.account?.name ?? '')
const cash = ref(
  props.account && store.portfolio
    ? (latestObservation(store.portfolio, 'cash', props.account.id)?.amount ?? '0')
    : '',
)
const error = ref('')
const nameInput = ref<HTMLInputElement>()
onMounted(() => nameInput.value?.focus())
async function save() {
  error.value = ''
  try {
    await store.saveAccount({
      expectedPortfolioEpoch,
      id: props.account?.id,
      name: name.value,
      cash: cash.value,
    })
    emit('done')
  } catch (failure) {
    error.value =
      failure instanceof Error
        ? failure.message
        : 'The account could not be saved. Please try again.'
  }
}
</script>

<template>
  <form class="card editor" aria-labelledby="account-form-title" @submit.prevent="save">
    <h2 id="account-form-title">{{ account ? 'Update account' : 'Add an account' }}</h2>
    <p class="muted">
      Enter today’s cash balance in {{ store.portfolio?.settings.reportingCurrency }}. Add
      investments to this account after saving.
    </p>
    <div class="form-grid">
      <div class="field">
        <label for="account-name">Account name</label>
        <input
          id="account-name"
          ref="nameInput"
          v-model="name"
          required
          maxlength="120"
          placeholder="e.g. Main bank or brokerage"
          autocomplete="off"
        />
      </div>
      <div class="field">
        <label for="account-cash"
          >Cash balance ({{ store.portfolio?.settings.reportingCurrency }})</label
        >
        <input
          id="account-cash"
          v-model="cash"
          required
          inputmode="text"
          maxlength="32"
          placeholder="0.00"
          aria-describedby="cash-hint"
        />
        <small id="cash-hint"
          >Use a decimal point, without separators. A negative balance counts as a liability.</small
        >
      </div>
    </div>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <div class="actions">
      <button :disabled="store.saving" type="submit">
        {{ store.saving ? 'Saving…' : 'Save account' }}
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
