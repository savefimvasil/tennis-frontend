// Drives bake.html in headless Chromium and writes public/models/trees/trees.glb plus the
// leaf and bark textures in public/textures/trees/.
// Usage: npm run dev (in another terminal), then: node tools/trees/run.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const port = process.env.PORT ?? '5173'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 500 } })
page.on('console', (m) => m.type() === 'error' && console.error(m.text()))
await page.goto(`http://localhost:${port}/tools/trees/bake.html`)
await page.waitForFunction(() => window.__done, null, { timeout: 120000 })
const done = await page.evaluate(() => window.__done)
if (process.argv[2]) await page.screenshot({ path: process.argv[2] })
await browser.close()
if (done.error) {
  console.error(done.error)
  process.exit(1)
}
mkdirSync('public/models/trees', { recursive: true })
mkdirSync('public/textures/trees', { recursive: true })
writeFileSync('public/models/trees/trees.glb', Buffer.from(done.glb, 'base64'))
for (const [name, data] of Object.entries(done.textures))
  writeFileSync(`public/textures/trees/${name}`, Buffer.from(data, 'base64'))
console.log(JSON.stringify(done.report, null, 1))
