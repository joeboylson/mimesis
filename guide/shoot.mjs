#!/usr/bin/env node
// Takes the screenshots on the Guide page. It starts a throwaway Mimesis,
// walks one sample review through the whole flow (add images, mark up, the AI
// answers, compare, approve) and photographs each step into web/public/guide.
// Run it again whenever the screens change:
//
//   node guide/shoot.mjs        (or: cd web && npm run guide)
//
// Needs a built page (cd web && npm run build) and Playwright, set up once with
//   npm i --prefix ~/.mimesis/capture playwright && npx --prefix ~/.mimesis/capture playwright install chromium

import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(REPO, 'web/public/guide')
const PORT = 4697
const BASE = `http://127.0.0.1:${PORT}`
const VIEWPORT = { width: 1440, height: 900 }

const FREEZE_CSS = `
  /* The script runs on a throwaway folder; its warning isn't part of the flow. */
  [data-other-folder] { display: none !important; }
  *, *::before, *::after {
    animation-duration: 0s !important; animation-delay: 0s !important;
    transition-duration: 0s !important; transition-delay: 0s !important;
    caret-color: transparent !important;
  }
`

function loadPlaywright() {
  for (const base of [join(REPO, 'x'), join(homedir(), '.mimesis', 'capture', 'x')]) {
    try {
      return createRequire(base)('playwright')
    } catch {}
  }
  console.error('Playwright not found. Set it up once:\n  npm i --prefix ~/.mimesis/capture playwright && npx --prefix ~/.mimesis/capture playwright install chromium')
  process.exit(1)
}

// The sample app being reviewed: a sign-up screen, before and after the fixes.
function signUp({ fixed }) {
  return `<!doctype html><html><head><style>
    body { margin: 0; font: 15px/1.5 -apple-system, system-ui, sans-serif; background: #f6f5f1; color: #1c1c1a; }
    .bar { display: flex; align-items: center; gap: 10px; padding: 18px 32px; font-weight: 600; }
    .dot { width: 22px; height: 22px; border-radius: 6px; background: #3f7d4e; }
    .card { width: 380px; margin: 60px auto; background: #fff; border-radius: 14px; padding: 32px; box-shadow: 0 1px 3px #0001, 0 8px 24px #0000000d; }
    h1 { margin: 0 0 4px; font-size: ${fixed ? '26px' : '17px'}; }
    p { margin: 0 0 24px; color: #6b6b66; }
    label { display: block; font-size: 13px; font-weight: 500; margin: 14px 0 6px; }
    input { box-sizing: border-box; width: 100%; padding: 10px 12px; border: 1px solid #dcdbd5; border-radius: 8px; font: inherit; }
    button { width: 100%; margin-top: 22px; padding: 11px; border: 0; border-radius: 8px; font: inherit; font-weight: 600;
      background: ${fixed ? '#3f7d4e' : '#e4e3dd'}; color: ${fixed ? '#fff' : '#a3a29c'}; }
    .forgot { display: ${fixed ? 'block' : 'none'}; margin-top: 14px; text-align: center; font-size: 13px; color: #3f7d4e; }
  </style></head><body>
    <div class="bar"><span class="dot"></span>Sprout</div>
    <div class="card">
      <h1 id="title">Create your account</h1>
      <p>Start growing in under a minute.</p>
      <label>Email</label><input value="ada@example.com">
      <label>Password</label><input id="password" type="password" value="hunter22">
      <button id="submit">Sign up</button>
      <a class="forgot">Forgot your password?</a>
    </div>
  </body></html>`
}

function simpleScreen(title, rows) {
  return `<!doctype html><html><body style="margin:0;font:15px/1.5 -apple-system,system-ui,sans-serif;background:#f6f5f1;color:#1c1c1a">
    <div style="display:flex;align-items:center;gap:10px;padding:18px 32px;font-weight:600"><span style="width:22px;height:22px;border-radius:6px;background:#3f7d4e"></span>Sprout</div>
    <div style="max-width:760px;margin:40px auto;background:#fff;border-radius:14px;padding:32px;box-shadow:0 1px 3px #0001">
      <h1 style="margin:0 0 20px;font-size:24px">${title}</h1>
      ${rows.map((row) => `<div style="display:flex;justify-content:space-between;padding:14px 0;border-top:1px solid #eeede8"><span>${row[0]}</span><span style="color:#6b6b66">${row[1]}</span></div>`).join('')}
    </div></body></html>`
}

async function render(browser, html, file) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 760 }, deviceScaleFactor: 1 })
  await page.setContent(html)
  // Where things are, as fractions of the image, so marks can land on them.
  const box = async (selector) => {
    if ((await page.locator(selector).count()) === 0) return null
    const b = await page.locator(selector).boundingBox()
    return b && { x: b.x / 1200, y: b.y / 760, w: b.width / 1200, h: b.height / 760 }
  }
  await page.screenshot({ path: file })
  const boxes = { title: await box('#title'), submit: await box('#submit'), password: await box('#password') }
  await page.close()
  return boxes
}

async function api(path, init) {
  const response = await fetch(`${BASE}/api${path}`, init)
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`)
  return response.json()
}

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      return await api('/version')
    } catch {
      await new Promise((done) => setTimeout(done, 100))
    }
  }
  throw new Error('the server never came up')
}

const terminal = (command, output) => `<!doctype html><html><body style="margin:0;background:#f6f5f1">
  <div id="shot" style="display:inline-block;padding:48px"><div style="width:1100px;border-radius:12px;overflow:hidden;box-shadow:0 10px 40px #0002;font:15px/1.6 ui-monospace,Menlo,monospace">
    <div style="background:#2b2b29;padding:10px 14px;display:flex;gap:7px">${['#ff5f57', '#febc2e', '#28c840'].map((c) => `<span style="width:12px;height:12px;border-radius:50%;background:${c}"></span>`).join('')}</div>
    <pre style="margin:0;background:#1c1c1a;color:#e8e6df;padding:22px 26px;white-space:pre-wrap"><span style="color:#8fbf8f">$</span> ${command}\n${output.replace(/</g, '&lt;')}</pre>
  </div></div></body></html>`

async function main() {
  const binary = join(REPO, 'target/debug/mimesis')
  execFileSync('cargo', ['build', '-q', '-p', 'mimesis'], { cwd: REPO, stdio: 'inherit' })
  const home = mkdtempSync(join(tmpdir(), 'mimesis-guide-'))
  const env = { ...process.env, MIMESIS_HOME: home }
  const mimesis = (...args) => execFileSync(binary, args, { env, encoding: 'utf8' })
  const server = spawn(binary, ['serve', '--port', String(PORT)], { env, stdio: 'ignore' })
  const { chromium } = loadPlaywright()
  const browser = await chromium.launch()
  mkdirSync(OUT, { recursive: true })

  try {
    await waitForServer()

    // The sample images.
    const before = join(home, 'sign-up.png')
    const after = join(home, 'sign-up-v2.png')
    const at = await render(browser, signUp({ fixed: false }), before)
    await render(browser, signUp({ fixed: true }), after)
    const pricing = join(home, 'pricing.png')
    const settings = join(home, 'settings.png')
    await render(browser, simpleScreen('Pricing', [['Seedling', 'Free'], ['Sapling', '$8 / month'], ['Grove', '$24 / month']]), pricing)
    await render(browser, simpleScreen('Settings', [['Email', 'ada@example.com'], ['Notifications', 'Weekly'], ['Theme', 'System']]), settings)

    const review = await api('/reviews', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Sprout sign-up' }) })
    for (const file of [before, pricing, settings]) {
      const name = file.split('/').pop()
      await api(`/reviews/${review.id}/items?name=${name}`, { method: 'POST', body: readFileSync(file) })
    }
    const items = (await api(`/reviews/${review.id}`)).items
    const signUpItem = items[0]
    const round = signUpItem.rounds[0]

    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, colorScheme: 'light', reducedMotion: 'reduce', locale: 'en-US', timezoneId: 'UTC' })
    const shoot = async (name, hash, waitFor, actions = async () => {}) => {
      const page = await context.newPage()
      await page.goto(`${BASE}/${hash}`)
      await page.addStyleTag({ content: FREEZE_CSS })
      await actions(page)
      await page.waitForSelector(waitFor, { timeout: 15000 })
      await page.waitForLoadState('networkidle').catch(() => {})
      await page.evaluate(() => document.fonts.ready)
      await page.screenshot({ path: join(OUT, `${name}.png`) })
      await page.close()
      console.log(join(OUT, `${name}.png`))
    }

    // 1. A review with its images, waiting on you.
    await shoot('1-review', `#/r/${review.id}`, 'text=sign-up.png')

    // 2. You mark what should change.
    const pad = 0.012
    const marks = [
      { id: 'a', color: '#ef4444', note: 'This reads as disabled. Use the brand green so it looks clickable.', kind: 'rect', x: at.submit.x - pad, y: at.submit.y - pad, w: at.submit.w + 2 * pad, h: at.submit.h + 2 * pad },
      { id: 'b', color: '#ef4444', note: 'Heading is too small for the main thing on the page.', kind: 'ellipse', x: at.title.x - pad, y: at.title.y - pad, w: at.title.w + 2 * pad, h: at.title.h + 2 * pad },
      { id: 'c', color: '#3b82f6', note: "Add a 'Forgot your password?' link under the button.", kind: 'arrow', x1: at.submit.x + at.submit.w + 0.1, y1: at.submit.y + at.submit.h + 0.1, x2: at.submit.x + at.submit.w * 0.7, y2: at.submit.y + at.submit.h + 0.03 },
    ]
    await api(`/rounds/${round.id}/marks`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ annotations: marks, note: '' }) })
    await shoot('2-mark-up', `#/r/${review.id}/${signUpItem.id}`, 'text=reads as disabled')

    // 3. Your AI picks up the marks.
    await api(`/items/${signUpItem.id}/send`, { method: 'POST' })
    const pulled = mimesis('pull', '--review', String(review.id), '--out', join(home, 'pull')).replaceAll(home, '~/project/.mimesis')
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 2 })
    await page.setContent(terminal(`mimesis pull --review ${review.id}`, pulled))
    await page.locator('#shot').screenshot({ path: join(OUT, '3-ai-pulls.png') })
    await page.close()
    console.log(join(OUT, '3-ai-pulls.png'))

    // 4. It answers with a new version, which you compare with your marks.
    mimesis('respond', String(signUpItem.id), after, '-r', '1=The button is brand green now.', '-r', '2=Bumped the heading to 26px.', '-r', '3=Added the forgot-password link.')
    await shoot('4-compare', `#/r/${review.id}/${signUpItem.id}`, 'text=your marks', async (page) => {
      await page.waitForSelector("[aria-label='Box']")
      await page.keyboard.press('Backslash')
    })

    // 5. Approve each image; once all are approved, finish the review.
    for (const item of items) await api(`/items/${item.id}/approve`, { method: 'POST' })
    await shoot('5-finish', `#/r/${review.id}`, 'text=Finish review')

    await context.close()
  } finally {
    await browser.close()
    server.kill()
    rmSync(home, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
