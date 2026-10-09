// Drives convert.html in headless Chromium and writes public/models/rocketbox/<Name>.glb.
// Usage: npm run dev (in another terminal), then: node tools/rocketbox/run.mjs Sports_Male_04
import { writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const name = process.argv[2] ?? 'Sports_Male_04'
const port = process.env.PORT ?? '5173'
const browser = await chromium.launch()
const page = await browser.newPage()
page.on('console', (m) => m.type() === 'error' && console.error(m.text()))
await page.goto(`http://localhost:${port}/tools/rocketbox/convert.html?avatar=${name}`)
await page.waitForFunction(() => window.__done, null, { timeout: 120000 })
const done = await page.evaluate(() => window.__done)
await browser.close()
if (done.error) {
  console.error(done.error)
  process.exit(1)
}
writeFileSync(`public/models/rocketbox/${name}.glb`, Buffer.from(done.glb, 'base64'))
console.log(JSON.stringify(done.report, null, 1))
