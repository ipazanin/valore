<script setup lang="ts">
import { ref } from 'vue'
import { usePortfolioStore } from '../application/store'
import { SUPPORTED_CURRENCIES } from '../domain/currency'
import BackupPanel from '../../backup/BackupPanel.vue'

const emit = defineEmits<{ ready: [] }>()
const store = usePortfolioStore()
const currency = ref('EUR')
const restoring = ref(false)
const error = ref('')
const currencyNames = new Intl.DisplayNames('en', { type: 'currency' })
async function start() {
  error.value = ''
  try {
    await store.initialize(currency.value)
    emit('ready')
  } catch (failure) {
    error.value =
      failure instanceof Error ? failure.message : 'Setup could not be saved. Please try again.'
  }
}
</script>

<template>
  <section class="onboarding" aria-labelledby="setup-title">
    <div class="intro">
      <p class="eyebrow">Welcome to Valore</p>
      <h1 id="setup-title">Know what you own.<br />See where you stand.</h1>
      <p class="muted">
        A calm place for your cash, investments, assets, and debts. Start with today’s values and
        build your financial picture at your own pace.
      </p>
    </div>
    <div class="setup-grid">
      <form class="card setup" aria-labelledby="currency-title" @submit.prevent="start">
        <span class="step" aria-hidden="true">01</span>
        <h2 id="currency-title">Choose your currency</h2>
        <p class="muted">
          Use one currency for every balance, valuation, and investment listing. Currency conversion
          comes later.
        </p>
        <div class="field">
          <label for="reporting-currency">Reporting currency</label
          ><select id="reporting-currency" v-model="currency">
            <option v-for="code in SUPPORTED_CURRENCIES" :key="code" :value="code">
              {{ code }} — {{ currencyNames.of(code) }}
            </option>
          </select>
        </div>
        <small
          >This choice stays fixed for this portfolio. Add only amounts and listings already in this
          currency.</small
        >
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <button type="submit" :disabled="store.saving">
          {{ store.saving ? 'Setting up…' : 'Start adding records' }}
        </button>
      </form>
      <div class="card restore-intro">
        <span class="step" aria-hidden="true">↥</span>
        <h2>Bringing your portfolio?</h2>
        <p class="muted">
          Restore a Valore backup to pick up where you left off. The backup includes your saved
          reporting currency.
        </p>
        <button class="secondary" :disabled="store.saving" @click="restoring = !restoring">
          {{ restoring ? 'Close restore' : 'Choose a backup' }}
        </button>
        <div class="privacy-note">
          <strong>Local by design</strong>
          <p>
            No account to create. Your records stay in this browser. Keep regular backups so they
            stay yours.
          </p>
        </div>
      </div>
    </div>
    <BackupPanel v-if="restoring" onboarding @restored="emit('ready')" />
  </section>
</template>

<style scoped>
.onboarding {
  max-width: 900px;
  margin: 1rem auto 0;
}
.intro {
  max-width: 620px;
  margin-bottom: 2.5rem;
}
.intro h1 {
  font-size: clamp(2.4rem, 5vw, 3.6rem);
  line-height: 1.12;
}
.intro > p:last-child {
  max-width: 55ch;
  font-size: 1.05rem;
}
.setup-grid {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 1.25rem;
  margin-bottom: 1.5rem;
}
.step {
  display: grid;
  place-items: center;
  height: 36px;
  width: 36px;
  border-radius: 50%;
  background: var(--tint);
  color: var(--brand);
  font-size: 0.8rem;
  font-weight: 700;
  margin-bottom: 1.5rem;
}
.setup > small {
  display: block;
  margin: 0.65rem 0 1.5rem;
}
.setup > button {
  width: 100%;
}
.setup p,
.restore-intro p {
  font-size: 0.9rem;
}
.privacy-note {
  border-top: 1px solid var(--line);
  padding-top: 1.25rem;
  margin-top: 2rem;
  font-size: 0.85rem;
}
.privacy-note p {
  margin: 0.4rem 0 0;
  color: var(--muted);
}
@media (max-width: 650px) {
  .setup-grid {
    grid-template-columns: 1fr;
  }
  .intro {
    margin-bottom: 1.5rem;
  }
}
</style>
