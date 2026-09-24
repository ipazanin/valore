<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { usePortfolioStore } from '../application/store'
import { isLocalDate, localToday } from '../domain/dates'
import { displayDate } from './labels'

const props = defineProps<{
  kind: 'account' | 'holding' | 'record'
  subjectId: string
  subjectLabel: string
  closedOn?: string | null
}>()
const emit = defineEmits<{ done: [] }>()
const store = usePortfolioStore()
const draftDate = ref(props.closedOn ?? localToday())
const editing = ref(false)
const openEpoch = ref('')
const pending = ref<{ closedOn: string | null; epoch: string } | null>(null)
const error = ref('')
const triggerButton = ref<HTMLButtonElement>()
const dateInput = ref<HTMLInputElement>()
const confirmButton = ref<HTMLButtonElement>()

async function open() {
  openEpoch.value = store.portfolioEpoch ?? ''
  draftDate.value = props.closedOn ?? localToday()
  editing.value = true
  pending.value = null
  error.value = ''
  await nextTick()
  dateInput.value?.focus()
}

async function reviewClosure() {
  if (!isLocalDate(draftDate.value) || draftDate.value > localToday()) {
    error.value = 'Choose a valid current or past closure date.'
    return
  }
  pending.value = { closedOn: draftDate.value, epoch: openEpoch.value }
  error.value = ''
  await nextTick()
  confirmButton.value?.focus()
}

async function reviewRemoval() {
  pending.value = { closedOn: null, epoch: openEpoch.value }
  error.value = ''
  await nextTick()
  confirmButton.value?.focus()
}

async function cancel() {
  if (pending.value) {
    pending.value = null
    await nextTick()
    dateInput.value?.focus()
    return
  }
  editing.value = false
  error.value = ''
  await nextTick()
  triggerButton.value?.focus()
}

async function confirm() {
  const decision = pending.value
  if (!decision) return
  error.value = ''
  try {
    await store.saveClosure(props.kind, props.subjectId, decision.closedOn, decision.epoch)
    pending.value = null
    editing.value = false
    emit('done')
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : 'The closure could not be saved.'
  }
}
</script>

<template>
  <div class="closure-control">
    <button
      v-if="!editing"
      ref="triggerButton"
      class="quiet"
      type="button"
      :disabled="store.saving"
      :aria-label="`${closedOn ? 'Change closure for' : 'Archive'} ${subjectLabel}`"
      @click="open"
    >
      {{ closedOn ? 'Change closure' : 'Archive' }}
    </button>
    <div v-else class="closure-editor">
      <strong>{{ closedOn ? 'Change closure' : 'Archive' }} · {{ subjectLabel }}</strong>
      <p v-if="kind === 'account'">
        The account and its holdings leave current totals on the closure date. Cash and every
        holding quantity must be recorded as zero by then. No later observations can remain.
      </p>
      <p v-else>
        This record leaves current totals on the closure date. Earlier history remains available.
        Sale proceeds or repayments must be entered as separate cash balances.
      </p>
      <form v-if="!pending" class="closure-form" @submit.prevent="reviewClosure">
        <div class="field">
          <label :for="`closure-date-${subjectId}`">Closure date</label>
          <input
            :id="`closure-date-${subjectId}`"
            ref="dateInput"
            v-model="draftDate"
            type="date"
            required
            :max="localToday()"
          />
        </div>
        <div class="actions">
          <button type="submit" :disabled="store.saving">Review closure</button>
          <button
            v-if="closedOn"
            type="button"
            class="secondary"
            :disabled="store.saving"
            @click="reviewRemoval"
          >
            Remove closure
          </button>
          <button type="button" class="secondary" :disabled="store.saving" @click="cancel">
            Cancel
          </button>
        </div>
      </form>
      <div v-else class="confirmation" role="group" :aria-label="`Confirm closure for ${subjectLabel}`">
        <p v-if="pending.closedOn">
          Archive from {{ displayDate(pending.closedOn) }}? Values stop contributing on that date.
          Earlier observations stay available in History. No cash movement is created.
        </p>
        <p v-else>
          Remove this closure? Earlier saved amounts may carry forward into current totals. This
          corrects the closure; it does not record a new reopening date.
        </p>
        <div class="actions">
          <button ref="confirmButton" type="button" :disabled="store.saving" @click="confirm">
            {{ store.saving ? 'Saving…' : 'Confirm change' }}
          </button>
          <button type="button" class="secondary" :disabled="store.saving" @click="cancel">
            Back
          </button>
        </div>
      </div>
      <p v-if="error" role="alert" class="error">{{ error }}</p>
    </div>
  </div>
</template>

<style scoped>
.closure-editor {
  display: grid;
  gap: 0.6rem;
  padding: 1rem;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--tint);
}
.closure-editor p {
  margin: 0;
  font-size: 0.88rem;
}
.closure-form,
.confirmation {
  display: grid;
  gap: 0.75rem;
}
.closure-form .field {
  max-width: 18rem;
}
.closure-control {
  min-width: 0;
}
</style>
