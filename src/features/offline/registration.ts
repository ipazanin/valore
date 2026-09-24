export interface OfflineState {
  online: boolean
  status: 'preparing' | 'ready' | 'unavailable' | 'failed' | 'development'
  updateAvailable: boolean
  error: string | null
}

export function registerOffline(onState: (state: OfflineState) => void): () => void {
  const state: OfflineState = {
    online: navigator.onLine,
    status: 'preparing',
    updateAvailable: false,
    error: null,
  }
  let disposed = false
  let registration: ServiceWorkerRegistration | undefined
  let ready = false
  const workers = new Set<ServiceWorker>()
  const publish = (): void => {
    if (!disposed) onState({ ...state })
  }
  const refresh = (): void => {
    if (disposed || !registration) return
    state.updateAvailable = Boolean(registration.waiting && registration.active)
    for (const worker of [registration.installing, registration.waiting, registration.active]) {
      if (worker && !workers.has(worker)) {
        workers.add(worker)
        worker.addEventListener('statechange', workerChanged)
      }
    }
    if (ready && registration.active?.state === 'activated') state.status = 'ready'
    publish()
  }
  const workerChanged = (event: Event): void => {
    const worker = event.target as ServiceWorker
    if (worker.state === 'redundant' && !registration?.active) {
      state.status = 'failed'
      state.error = 'Offline setup did not finish. Reopen Valore while connected to try again.'
    }
    refresh()
  }
  const connectionChanged = (): void => {
    if (disposed || state.online === navigator.onLine) return
    state.online = navigator.onLine
    publish()
    if (state.online && registration) {
      void registration.update().then(() => {
        state.error = null
        refresh()
      }).catch(() => {
        state.error = 'Could not check for an app update. Your current version is still open.'
        publish()
      })
    }
  }
  window.addEventListener('online', connectionChanged)
  window.addEventListener('offline', connectionChanged)
  window.addEventListener('focus', connectionChanged)
  document.addEventListener('visibilitychange', connectionChanged)
  const connectionTimer = window.setInterval(connectionChanged, 2_000)

  if (!import.meta.env.PROD) {
    state.status = 'development'
    publish()
  } else if (!window.isSecureContext || !('serviceWorker' in navigator)) {
    state.status = 'unavailable'
    publish()
  } else {
    publish()
    const base = new URL(import.meta.env.BASE_URL, document.baseURI)
    const workerUrl = new URL('sw.js', base)
    const scope = new URL('./', workerUrl).href
    const trackRegistration = (savedRegistration: ServiceWorkerRegistration): void => {
      if (disposed) return
      registration?.removeEventListener('updatefound', refresh)
      registration = savedRegistration
      registration.addEventListener('updatefound', refresh)
      refresh()
      void navigator.serviceWorker.ready.then((activeRegistration) => {
        if (disposed || activeRegistration.scope !== scope ||
          activeRegistration.active?.scriptURL !== workerUrl.href) return
        ready = true
        refresh()
      })
    }
    void navigator.serviceWorker.register(workerUrl.href, { scope })
      .then(trackRegistration)
      .catch(async () => {
        try {
          const cachedRegistration = await navigator.serviceWorker.getRegistration(scope)
          if (cachedRegistration?.active?.scriptURL === workerUrl.href) {
            trackRegistration(cachedRegistration)
            return
          }
        } catch {
          // Browsers can deny access to service worker storage.
        }
        state.status = 'failed'
        state.error = 'Offline setup is unavailable. Reopen Valore while connected to try again.'
        publish()
      })
  }

  return () => {
    disposed = true
    window.removeEventListener('online', connectionChanged)
    window.removeEventListener('offline', connectionChanged)
    window.removeEventListener('focus', connectionChanged)
    document.removeEventListener('visibilitychange', connectionChanged)
    window.clearInterval(connectionTimer)
    registration?.removeEventListener('updatefound', refresh)
    for (const worker of workers) worker.removeEventListener('statechange', workerChanged)
  }
}
