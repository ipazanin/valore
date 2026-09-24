import { expect, test as base, type Page } from '@playwright/test'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import type { AddressInfo } from 'node:net'

interface OfflineSite {
  url: string
  reviseWorker: () => void
  setAvailable: (available: boolean) => Promise<void>
}

const test = base.extend<{ offlineSite: OfflineSite }>({
  offlineSite: async ({}, use) => {
    const directory = resolve('dist')
    let revision = 0
    const mimeTypes: Record<string, string> = {
      '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
      '.json': 'application/json', '.webmanifest': 'application/manifest+json',
      '.png': 'image/png', '.svg': 'image/svg+xml',
    }
    const server = createServer(async (request, response) => {
      const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
      const relative = pathname.replace(/^\/valore\//, '').replace(/^\//, '') || 'index.html'
      const filename = resolve(directory, relative)
      if (!filename.startsWith(directory + sep)) {
        response.writeHead(403).end()
        return
      }
      try {
        let contents = await readFile(filename)
        if (relative === 'sw.js') {
          contents = Buffer.concat([contents, Buffer.from(`
self.addEventListener('message', (event) => {
  if (event.data === 'TEST_REVISION') event.ports[0].postMessage(${revision});
});
`)])
        }
        response.writeHead(200, {
          'Content-Type': mimeTypes[extname(filename)] ?? 'application/octet-stream',
          'Cache-Control': 'no-store',
        }).end(contents)
      } catch {
        response.writeHead(404).end()
      }
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as AddressInfo).port
    const setAvailable = async (available: boolean): Promise<void> => {
      if (available === server.listening) return
      if (available) {
        await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve))
      } else {
        await new Promise<void>((resolve, reject) => {
          server.close((error) => error ? reject(error) : resolve())
          server.closeAllConnections()
        })
      }
    }
    try {
      await use({ url: `http://127.0.0.1:${port}`, reviseWorker: () => { revision += 1 }, setAvailable })
    } finally {
      await setAvailable(false)
    }
  },
})

async function tab(page: Page, name: string) {
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name }).click()
}

async function startReadyPortfolio(page: Page, url: string) {
  await page.goto(url)
  await expect(page.getByText('Ready for offline use', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Start adding records' }).click()
  await expect(page.getByTestId('net-worth')).toHaveText('EUR 0.00')
  await page.reload()
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
}

async function activeRevision(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready
    return new Promise<number>((resolve) => {
      const channel = new MessageChannel()
      channel.port1.onmessage = (event) => {
        channel.port1.close()
        resolve(event.data)
      }
      registration.active!.postMessage('TEST_REVISION', [channel.port2])
    })
  })
}

for (const path of ['/', '/valore/']) {
  test(`offline reopen, edit, calculate, export and restore at ${path}`, async ({ page, context, offlineSite, browserName }) => {
    const url = offlineSite.url + path
    await startReadyPortfolio(page, url)
    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href')
    expect(manifestHref).toBeTruthy()
    const manifestResponse = await page.request.get(new URL(manifestHref!, url).href)
    const manifest = await manifestResponse.json()
    expect(new URL(manifest.start_url, url).pathname).toBe(path)
    expect(new URL(manifest.scope, url).pathname).toBe(path)
    expect(manifest.icons.map((icon: { sizes: string }) => icon.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']))

    await offlineSite.setAvailable(false)
    await expect(fetch(url)).rejects.toThrow()
    // WebKit's offline emulation rejects service-worker responses even when they are cached.
    if (browserName !== 'webkit') await context.setOffline(true)
    const reopened = await context.newPage()
    const response = await reopened.goto(url)
    expect(response?.fromServiceWorker()).toBe(true)
    await expect(reopened.getByText('Ready for offline use', { exact: true })).toBeVisible()
    await expect(reopened.getByTestId('net-worth')).toHaveText('EUR 0.00')
    await tab(reopened, 'Accounts')
    await reopened.getByRole('button', { name: '+ Add account' }).click()
    await reopened.getByLabel('Account name').fill('Offline bank')
    await reopened.getByLabel('Cash balance (EUR)').fill('123.45')
    await reopened.getByRole('button', { name: 'Save account' }).click()
    await tab(reopened, 'Overview')
    await expect(reopened.getByTestId('net-worth')).toHaveText('EUR 123.45')
    await reopened.reload()
    await expect(reopened.getByTestId('net-worth')).toHaveText('EUR 123.45')
    await tab(reopened, 'Backup')
    const downloadPromise = reopened.waitForEvent('download')
    await reopened.getByRole('button', { name: 'Export backup' }).click()
    const download = await downloadPromise
    const chunks: Buffer[] = []
    for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk))
    const backup = Buffer.concat(chunks)
    expect(JSON.parse(backup.toString()).portfolio.accounts[0].name).toBe('Offline bank')
    await tab(reopened, 'Accounts')
    await reopened.getByRole('button', { name: 'Update Offline bank cash' }).click()
    await reopened.getByLabel('Cash balance (EUR)').fill('999')
    await reopened.getByRole('button', { name: 'Save account' }).click()
    await tab(reopened, 'Backup')
    await reopened.getByLabel('Backup file').setInputFiles({ name: 'offline.json', mimeType: 'application/json', buffer: backup })
    await reopened.getByLabel('I understand that this will replace my current portfolio.').check()
    await reopened.getByRole('button', { name: 'Replace portfolio' }).click()
    await tab(reopened, 'Overview')
    await expect(reopened.getByTestId('net-worth')).toHaveText('EUR 123.45')
    await offlineSite.setAvailable(true)
    if (browserName !== 'webkit') await context.setOffline(false)
    await expect(reopened.getByText(/Your browser reports no connection/)).toHaveCount(0)
    await reopened.close()
  })
}

test('an installed update waits while drafts and saved records remain usable', async ({ page, context, offlineSite }) => {
  const url = offlineSite.url + '/valore/'
  await startReadyPortfolio(page, url)
  await tab(page, 'Accounts')
  await page.getByRole('button', { name: '+ Add account' }).click()
  await page.getByLabel('Account name').fill('Draft through update')
  await page.getByLabel('Cash balance (EUR)').fill('72.50')
  expect(await activeRevision(page)).toBe(0)
  offlineSite.reviseWorker()
  await page.evaluate(async () => { await (await navigator.serviceWorker.ready).update() })
  await expect(page.getByText(/An app update is ready/)).toBeVisible()
  await expect(page.getByLabel('Account name')).toHaveValue('Draft through update')
  await expect(page.getByLabel('Cash balance (EUR)')).toHaveValue('72.50')
  expect(await page.evaluate(async () => Boolean((await navigator.serviceWorker.ready).waiting))).toBe(true)
  expect(await activeRevision(page)).toBe(0)
  await page.getByRole('button', { name: 'Save account' }).click()
  await tab(page, 'Overview')
  await expect(page.getByTestId('net-worth')).toHaveText('EUR 72.50')
  await page.close()
  const reopened = await context.newPage()
  await reopened.goto(url)
  await expect.poll(() => reopened.evaluate(async () => Boolean((await navigator.serviceWorker.ready).waiting))).toBe(false)
  await expect(reopened.getByText(/An app update is ready/)).toHaveCount(0)
  await expect(reopened.getByTestId('net-worth')).toHaveText('EUR 72.50')
  expect(await activeRevision(reopened)).toBe(1)
  await reopened.close()
})
