import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const icon = await readFile(new URL('../public/icon.svg', import.meta.url), 'utf8')
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 })
  await page.setContent(
    '<style>html,body{margin:0;width:100%;height:100%}svg{display:block;width:100%;height:100%}</style>' +
    icon,
  )
  for (const [filename, size] of [
    ['pwa-192x192.png', 192],
    ['pwa-512x512.png', 512],
    ['apple-touch-icon.png', 180],
  ]) {
    await page.setViewportSize({ width: size, height: size })
    await page.screenshot({
      path: fileURLToPath(new URL(`../public/${filename}`, import.meta.url)),
      omitBackground: true,
    })
  }
} finally {
  await browser.close()
}
