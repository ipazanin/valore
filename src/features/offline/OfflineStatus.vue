<script setup lang="ts">
import { computed, onMounted, onUnmounted, shallowRef } from 'vue'
import { registerOffline, type OfflineState } from './registration'

const offline = shallowRef<OfflineState>({
  online: true, status: 'preparing', updateAvailable: false, error: null,
})
let stop: (() => void) | undefined
onMounted(() => {
  stop = registerOffline((state) => { offline.value = state })
})
onUnmounted(() => stop?.())

const statusLabel = computed(() => {
  if (offline.value.status === 'ready') return 'Ready for offline use'
  if (offline.value.status === 'development') return 'Offline launch is available in the built app'
  if (offline.value.status === 'unavailable') return 'Offline launch is unavailable in this browser'
  if (offline.value.status === 'failed') return 'Offline setup could not finish'
  return 'Preparing offline use…'
})
</script>

<template>
  <aside class="offline-support" aria-label="Offline use and installation">
    <p class="offline-status" role="status">
      <strong>{{ statusLabel }}</strong>
      <span v-if="!offline.online"> · Your browser reports no connection.</span>
    </p>
    <p v-if="offline.updateAvailable" class="notice" role="status">
      An app update is ready. Save your drafts, then close all Valore tabs and app windows.
      Reopen Valore to use the update.
    </p>
    <p v-if="offline.error" class="error" role="status">{{ offline.error }}</p>
    <details>
      <summary>Offline use and installation</summary>
      <p v-if="offline.status === 'ready'">
        You can reopen Valore, view and edit saved records, and use supported backup flows offline
        in this browser. Keep exported backups: clearing browser storage also removes offline access.
      </p>
      <p v-else>
        Open Valore while connected and wait for “Ready for offline use” before relying on an
        offline launch. Your records can still be edited while this page is open.
      </p>
      <p>Installation is optional. All portfolio features work in a normal browser tab.</p>
      <ul>
        <li>Android: use Chrome’s Install app menu, or Firefox’s Add to Home screen menu.</li>
        <li>iPhone and iPad: use Share, then Add to Home Screen in a supported browser.</li>
        <li>Desktop Chrome or Edge: use the install option in the address bar or browser menu.</li>
        <li>
          Firefox on Windows: use its web app button when available. Firefox on macOS and Linux:
          keep using a browser tab.
        </li>
      </ul>
      <p class="muted">
        An installed app may use separate browser storage. If your records are missing, restore
        an exported backup. App updates wait until your open tabs and windows are closed.
      </p>
    </details>
  </aside>
</template>

<style scoped>
.offline-support {
  color: var(--muted);
  font-size: 0.85rem;
  border-top: 1px solid var(--line);
  padding-top: 1rem;
  margin-top: 2rem;
}
.offline-status {
  margin-bottom: 0.6rem;
}
.offline-status strong {
  font-weight: 500;
}
summary {
  cursor: pointer;
  padding-block: 0.7rem;
  min-height: 44px;
  color: var(--brand);
}
details p,
details ul {
  max-width: 75ch;
  line-height: 1.6;
}
details ul {
  padding-left: 1.25rem;
}
details li + li {
  margin-top: 0.4rem;
}
</style>
