// Shoots the menu backdrops: a still of each venue from the menu's camera, written to
// public/menu/<surface>.jpg. Re-run after changing a venue.
// Usage: npm run dev (in another terminal), then: node tools/menu/shoot.mjs
import { chromium } from 'playwright'

const port = process.env.PORT ?? '5173'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
for (const surface of ['hard', 'grass', 'clay']) {
  await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle', timeout: 120000 })
  await page.waitForFunction(() => window.__game)
  await page.evaluate(([s, q]) => {
    const g = window.__game.getState()
    g.setQuality(q)
    g.setSurface(s)
    g.start()
    // The menu's view: inside the venue, high over the corner, the whole court in frame.
    window.__camOverride = [
      [5.4, 5.3, 14],
      [0, 0.5, 0],
    ]
    window.__snapCamera = true
    const style = document.createElement('style')
    style.textContent = '.hud, .touch-controls { display: none !important }'
    document.head.appendChild(style)
  }, [surface, process.env.QUALITY ?? 'high'])
  await page.waitForFunction(() => window.__sim?.ball, null, { timeout: 120000 })
  // Textures, trees and the sky stream in; give them time.
  await page.waitForTimeout(Number(process.env.WAIT ?? 12000))
  await page.screenshot({ path: `public/menu/${surface}.jpg`, type: 'jpeg', quality: 80, timeout: 180000 })
  console.log('shot', surface)
}
await browser.close()
