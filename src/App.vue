<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { usePortfolioStore } from './features/portfolio/application/store'
import OnboardingPanel from './features/portfolio/components/OnboardingPanel.vue'
import OverviewPanel from './features/portfolio/components/OverviewPanel.vue'
import AccountsPanel from './features/portfolio/components/AccountsPanel.vue'
import RecordsPanel from './features/portfolio/components/RecordsPanel.vue'
import BackupPanel from './features/backup/BackupPanel.vue'

const store = usePortfolioStore()
type Tab = 'overview' | 'accounts' | 'records' | 'backup'
const tab = ref<Tab>('overview')
const restoreGeneration = ref(0)
const openingError = ref<string | null>(null)
const tabs: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'records', label: 'Assets & debts' },
  { id: 'backup', label: 'Backup' },
]
async function openPortfolio() {
  openingError.value = null
  await store.load()
  if (!store.portfolio) openingError.value = store.error
}
onMounted(openPortfolio)
function restored() {
  restoreGeneration.value += 1
}
</script>

<template>
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="site-header">
    <div class="header-inner">
      <a class="wordmark" href="#" aria-label="Valore home" @click.prevent="tab = 'overview'"
        ><span class="logo" aria-hidden="true">v.</span>valore<span
          class="wordmark-dot"
          aria-hidden="true"
          >.</span
        ></a
      ><span class="header-note">A clear view of what’s yours</span
      ><span class="edition">Manual portfolio</span>
    </div>
  </header>
  <div class="app-shell">
    <nav v-if="store.portfolio" aria-label="Main navigation" class="navigation">
      <button
        v-for="section in tabs"
        :key="section.id"
        :class="{ active: tab === section.id }"
        :aria-current="tab === section.id ? 'page' : undefined"
        @click="tab = section.id"
      >
        {{ section.label }}</button
      ><span class="currency">{{ store.portfolio.settings.reportingCurrency }}</span>
    </nav>
    <main id="main" tabindex="-1">
      <div v-if="store.loading" class="empty" role="status">Opening your portfolio…</div>
      <div v-else-if="openingError && !store.portfolio" class="card">
        <h1>Your records couldn’t be opened</h1>
        <p class="error" role="alert">{{ openingError }}</p>
        <p class="muted">
          Check that this browser allows site storage, then try again. Existing records have not
          been replaced.
        </p>
        <button @click="openPortfolio()">Try again</button>
      </div>
      <OnboardingPanel v-else-if="!store.portfolio" @ready="tab = 'overview'" />
      <template v-else>
        <p v-if="store.error" class="error" role="alert">{{ store.error }}</p>
        <OverviewPanel v-show="tab === 'overview'" @navigate="tab = $event" />
        <AccountsPanel v-show="tab === 'accounts'" :key="`accounts-${restoreGeneration}`" />
        <RecordsPanel v-show="tab === 'records'" :key="`records-${restoreGeneration}`" />
        <BackupPanel v-show="tab === 'backup'" @restored="restored" />
      </template>
    </main>
    <footer>
      <span>Valore · Your portfolio, clearly.</span
      ><span>Stored only in this browser. Keep a backup.</span>
    </footer>
  </div>
</template>

<style scoped>
.site-header {
  background: white;
  border-bottom: 1px solid var(--line);
}
.header-inner {
  max-width: 1180px;
  margin-inline: auto;
  display: flex;
  align-items: center;
  gap: 2rem;
  height: 88px;
  padding-inline: 2rem;
}
.wordmark {
  color: var(--ink);
  text-decoration: none;
  display: flex;
  align-items: center;
  font-size: 1.7rem;
  font-weight: 650;
  letter-spacing: -0.07em;
}
.logo {
  display: grid;
  place-items: center;
  background: var(--brand);
  border-radius: 11px;
  color: #dbea9d;
  font:
    italic 600 1.9rem Georgia,
    serif;
  width: 39px;
  height: 39px;
  margin-right: 0.7rem;
  padding-bottom: 0.25rem;
}
.wordmark-dot {
  color: #78a180;
}
.header-note {
  color: var(--muted);
  font-size: 0.8rem;
  border-left: 1px solid var(--line);
  padding-left: 1.75rem;
}
.edition {
  color: var(--muted);
  font-size: 0.72rem;
  margin-left: auto;
  border: 1px solid var(--line);
  border-radius: 20px;
  padding: 0.4rem 0.65rem;
}
.app-shell {
  max-width: 1180px;
  margin-inline: auto;
  padding: 0 2rem;
}
.navigation {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  border-bottom: 1px solid var(--line);
  padding: 1.05rem 0;
}
.navigation button {
  background: transparent;
  color: var(--muted);
  font-size: 0.85rem;
  font-weight: 550;
}
.navigation button.active {
  background: #e6eee3;
  color: var(--brand);
}
.navigation button:hover {
  color: var(--brand);
  background: var(--tint);
}
.currency {
  margin-left: auto;
  font-size: 0.75rem;
  color: var(--muted);
  font-weight: 650;
}
main {
  padding-block: 2.5rem 3rem;
  min-height: 70vh;
}
main:focus {
  outline: none;
}
footer {
  padding: 1.5rem 0 2rem;
  border-top: 1px solid var(--line);
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.5rem 1.5rem;
  font-size: 0.73rem;
  color: var(--muted);
}
.skip-link {
  position: fixed;
  left: 1rem;
  top: -100px;
  z-index: 10;
  background: white;
  padding: 1rem;
}
.skip-link:focus {
  top: 1rem;
}
@media (max-width: 650px) {
  .header-inner {
    height: 72px;
    padding-inline: 1.1rem;
  }
  .header-note {
    display: none;
  }
  .app-shell {
    padding-inline: 1rem;
  }
  main {
    padding-top: 1.75rem;
  }
  .navigation {
    gap: 0.2rem;
    justify-content: space-between;
  }
  .navigation button {
    padding-inline: 0.55rem;
    font-size: 0.8rem;
  }
  .currency {
    display: none;
  }
  .edition {
    font-size: 0.65rem;
  }
}
</style>
