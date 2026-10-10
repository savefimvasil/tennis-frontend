// Drives convert.html in headless Chromium and writes src/scene/athlete/mocap.json.
// Usage: npm run dev (in another terminal), then: node tools/mixamo/run.mjs
import { writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const port = process.env.PORT ?? '5173'
const browser = await chromium.launch()
const page = await browser.newPage()
page.on('console', (m) => m.type() === 'error' && console.error(m.text()))
await page.goto(`http://localhost:${port}/tools/mixamo/convert.html`)
await page.waitForFunction(() => window.__done, null, { timeout: 120000 })
const done = await page.evaluate(() => window.__done)
await browser.close()
if (done.error) {
  console.error(done.error)
  process.exit(1)
}
writeFileSync('src/scene/athlete/mocap.json', done.json + '\n')
console.log(JSON.stringify(done.report, null, 1))
