#!/usr/bin/env node
// Takes the same screenshots the same way every time, from a shot list, so
// two rounds of a screen differ only by what changed in the code.
//
//   node capture.mjs .ochre/shots.json [--only <name>[,<name>…]]
//
// Needs Playwright, from the project or from ~/.ochre/capture:
//   npm i --prefix ~/.ochre/capture playwright && npx --prefix ~/.ochre/capture playwright install chromium

import { mkdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

const FREEZE_CSS = `
  *, *::before, *::after {
    animation-duration: 0s !important; animation-delay: 0s !important;
    transition-duration: 0s !important; transition-delay: 0s !important;
    caret-color: transparent !important;
  }
  html { scroll-behavior: auto !important; }
`

function loadPlaywright() {
  for (const base of [join(process.cwd(), 'x'), join(homedir(), '.ochre', 'capture', 'x')]) {
    try {
      return createRequire(base)('playwright')
    } catch {}
  }
  console.error('Playwright not found. Set it up once:\n  npm i --prefix ~/.ochre/capture playwright && npx --prefix ~/.ochre/capture playwright install chromium')
  process.exit(1)
}

function parseArgs(argv) {
  const [file, ...rest] = argv
  if (!file) {
    console.error('usage: node capture.mjs <shots.json> [--only name,name]')
    process.exit(1)
  }
  const only = rest.includes('--only') ? rest[rest.indexOf('--only') + 1]?.split(',') : null
  return { file: resolve(file), only }
}

async function act(page, action) {
  if (action.click) await page.click(action.click)
  if (action.fill) await page.fill(action.fill[0], action.fill[1])
  if (action.hover) await page.hover(action.hover)
  if (action.press) await page.keyboard.press(action.press)
  if (action.wait) await page.waitForTimeout(action.wait)
  if (action.eval) await page.evaluate(action.eval)
}

async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.evaluate(() => document.fonts.ready)
  // Two frames, so layout from late fonts or images has landed.
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))))
}

async function main() {
  const { file, only } = parseArgs(process.argv.slice(2))
  const config = JSON.parse(readFileSync(file, 'utf8'))
  const root = dirname(file)
  // Run from the project root: a relative "out" is from there, like the paths in the skill.
  const out = resolve(config.out ?? '.ochre/shots')
  mkdirSync(out, { recursive: true })

  const viewports = config.viewports ?? { desktop: [1440, 900] }
  const shots = (config.shots ?? []).filter((shot) => !only || only.includes(shot.name))
  if (!shots.length) {
    console.error(only ? `No shot named ${only.join(', ')} in ${file}` : `No shots in ${file}`)
    process.exit(1)
  }

  const { chromium } = loadPlaywright()
  const browser = await chromium.launch()
  const written = []
  let failed = 0
  try {
    for (const shot of shots) {
      for (const viewportName of shot.viewports ?? Object.keys(viewports)) {
        const size = viewports[viewportName]
        if (!size) throw new Error(`Shot ${shot.name} names viewport "${viewportName}", which isn't in "viewports"`)
        for (const scheme of shot.colorSchemes ?? config.colorSchemes ?? ['light']) {
          const context = await browser.newContext({
            viewport: { width: size[0], height: size[1] },
            deviceScaleFactor: config.scale ?? 2,
            colorScheme: scheme,
            reducedMotion: 'reduce',
            locale: config.locale ?? 'en-US',
            timezoneId: config.timezone ?? 'UTC',
            storageState: config.storageState ? resolve(root, config.storageState) : undefined,
          })
          const page = await context.newPage()
          const name = `${shot.name}-${viewportName}${scheme === 'light' ? '' : `-${scheme}`}.png`
          try {
            await page.goto(new URL(shot.path ?? '/', config.baseUrl).href, { waitUntil: 'load' })
            await page.addStyleTag({ content: FREEZE_CSS })
            for (const selector of shot.hide ?? []) await page.locator(selector).evaluateAll((els) => els.forEach((el) => (el.style.visibility = 'hidden')))
            for (const action of shot.actions ?? []) await act(page, action)
            if (shot.waitFor) await page.waitForSelector(shot.waitFor, { timeout: 15000 })
            await settle(page)
            const path = join(out, name)
            const mask = (shot.mask ?? []).map((selector) => page.locator(selector))
            if (shot.clip) await page.locator(shot.clip).screenshot({ path, mask, animations: 'disabled' })
            else await page.screenshot({ path, fullPage: !!shot.fullPage, mask, animations: 'disabled' })
            written.push(path)
            console.log(path)
          } catch (error) {
            failed++
            console.error(`✗ ${name}: ${error.message.split('\n')[0]}`)
          } finally {
            await context.close()
          }
        }
      }
    }
  } finally {
    await browser.close()
  }
  if (failed) {
    console.error(`${failed} shot${failed === 1 ? '' : 's'} failed; ${written.length} written.`)
    process.exit(1)
  }
}

main()
