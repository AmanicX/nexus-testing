import assert from 'node:assert/strict'
import { mkdtemp, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { createServer, preview } from 'vite'
import { _electron } from 'playwright'

// Test the production bundle using Electron's Chromium, with mocked provider HTTP.
// No paid requests, real credentials, personal chats or external browser download.
const require = createRequire(import.meta.url)
const out = process.env.EVA_TEST_OUTPUT || '/tmp/opencode/eva-image-gen'
await mkdir(out, { recursive: true })
const userData = await mkdtemp(path.join(out, 'profile-'))
const loader = await createServer({ server: { middlewareMode: true } })
const { DEFAULT_SETTINGS } = await loader.ssrLoadModule('/src/store/useStore.ts')
await loader.close()
const server = await preview({ preview: { host: '127.0.0.1', port: 0 } })
const url = server.resolvedUrls.local[0]
const env = { ...process.env, EVA_TEST_DATA_DIR: userData, EVA_TEST_URL: url }
delete env.ELECTRON_RUN_AS_NODE
const app = await _electron.launch({
  executablePath: require('electron'), args: [path.resolve('tests/e2e/electron.cjs')], env,
})
const page = await app.firstWindow()
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const requests = []
const concepts = [
  { title: 'Kite Workshop', subject: 'paper kite construction', prompt: 'Top-down paper kite construction on a wooden workbench, bright spools and scissors, soft daylight.' },
  { title: 'Quiet Picnic', subject: 'lakeside picnic food', prompt: 'A basket of fruit and sandwiches on a gingham blanket beside a lake, an inviting close-up food photograph.' },
  { title: 'Flight Mechanics', subject: 'flight diagram', prompt: 'An educational cutaway diagram explaining lift and wind direction, arrows over a clean white background.' },
  { title: 'Wind Runner', subject: 'runner portrait', prompt: 'A joyful child in a yellow coat running across an open grassy hill, dynamic portrait with loose expressive brushwork.' },
]
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWZkAAAAASUVORK5CYII='
let failImage = false
let holdWriter = false
let pendingWriter
try {
  await page.route('https://**/*', async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } })
    const body = request.postDataJSON()
    requests.push({ url: request.url(), body })
    if (request.url().includes(':generateContent')) {
      return route.fulfill({
        status: failImage ? 403 : 200, contentType: 'application/json',
        body: JSON.stringify(failImage ? { error: { message: 'BILLING_DISABLED' } } :
          { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: png } }] } }] }),
      })
    }
    if (request.url().includes('/chat/completions')) {
      if (holdWriter) await new Promise((resolve) => { pendingWriter = resolve })
      const content = body.messages[0].content.includes('ONE polished')
        ? JSON.stringify({ prompt: 'A vivid red kite flying above a quiet lake, framed from below with clear daylight.' })
        : JSON.stringify(concepts)
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content } }] }) }).catch(() => {})
    }
    return route.abort()
  })
  await page.addInitScript((defaults) => {
    window.evaDesktop = {
      getSecureCredential: async (name) => ['sec_provider_key_google', 'sec_provider_key_groq'].includes(name) ? 'dummy-test-key' : '',
      isSecureStorageAvailable: async () => true,
    }
    if (localStorage.getItem('nexus-chat-store')) return
    const conversation = {
      id: 'test-chat', theme: 'chatbot', characterId: 'test-character', title: 'Kites at the lake',
      memory: 'PRIVATE MEMORY NEVER SENT', createdAt: 0, updatedAt: 0,
      messages: ['OLD SECRET', 'Building a kite.', 'A lake would be nice.', 'Let us plan the picnic.'].map((content, i) => ({
        id: String(i), role: i % 2 ? 'assistant' : 'user', content, timestamp: i,
      })),
    }
    const character = {
      id: 'test-character', theme: 'chatbot', name: 'Avery', avatar: 'A', avatarColor: '#888888',
      description: 'PRIVATE BIOGRAPHY NEVER SENT', tagline: 'A thoughtful companion',
      gender: '', age: '25', tags: [], greeting: '', canon: 'custom', source: '', overrides: '', metadata: [], createdAt: 0,
    }
    localStorage.setItem('nexus-chat-store', JSON.stringify({ version: 7, state: {
      settings: { ...defaults, onboarded: true, frostedGlass: false, keyedProviders: ['google', 'groq'],
        imageDefault: { providerId: 'google', model: 'gemini-2.5-flash-image' },
        fallbackModel: { providerId: 'ollama', model: 'unused-local-judge' },
        providerModels: { ...defaults.providerModels, groq: { chatModel: 'openai/gpt-oss-120b' } } },
      characters: [character], worlds: [], conversations: [conversation], activeConversationId: conversation.id,
    } }))
  }, DEFAULT_SETTINGS)
  await page.reload()
  await page.waitForLoadState('networkidle')
  const open = () => page.locator('button[title="Image Gen"]').click()
  await open()
  const dialog = page.getByRole('dialog', { name: 'Image Gen' })
  await dialog.waitFor()

  // Gating: "Create four ideas" is disabled without explicit style choice
  const createIdeasBtn = dialog.getByRole('button', { name: 'Create four ideas' })
  assert.equal(await createIdeasBtn.isDisabled(), true, 'Create four ideas must be disabled before style selection')

  // Explicit style selection enables generation
  await dialog.getByRole('radio', { name: 'Auto / As written' }).click()
  assert.equal(await createIdeasBtn.isDisabled(), false, 'Create four ideas must be enabled after style selection')

  await createIdeasBtn.click()
  await dialog.getByRole('button', { name: 'Kite Workshop', exact: false }).waitFor()
  assert.equal(await dialog.locator('[aria-label="Image concepts"] button').count(), 4)
  assert(!JSON.stringify(requests).match(/OLD SECRET|PRIVATE MEMORY|PRIVATE BIOGRAPHY/))
  assert(JSON.stringify(requests).includes('Building a kite.'))
  await dialog.getByRole('button', { name: 'Kite Workshop', exact: false }).click()
  await dialog.locator('#image-prompt').fill('  My exact manual prompt.\n')

  // Changing visual style invalidates stale concepts and deselects old concept while preserving prompt
  await dialog.getByRole('radio', { name: 'Anime' }).click()
  assert.equal(await dialog.locator('[aria-label="Image concepts"] button').count(), 0, 'Concepts must be invalidated on style change')
  assert.equal(await dialog.locator('#image-prompt').inputValue(), '  My exact manual prompt.\n', 'Manual prompt must be preserved on style change')

  // Replacement concepts generated with Anime style
  await dialog.getByRole('button', { name: 'Create four ideas' }).click()
  await dialog.getByRole('button', { name: 'Kite Workshop', exact: false }).waitFor()
  assert.equal(await dialog.locator('[aria-label="Image concepts"] button').count(), 4)
  assert.equal(await dialog.locator('#image-prompt').inputValue(), '  My exact manual prompt.\n')

  await dialog.getByRole('button', { name: 'Refresh four ideas' }).click()
  await dialog.getByRole('button', { name: 'Refresh four ideas' }).waitFor({ state: 'visible' })
  await page.waitForFunction(() => !document.querySelector('#image-prompt').disabled)
  assert.equal(await dialog.locator('#image-prompt').inputValue(), '  My exact manual prompt.\n')
  await dialog.getByRole('button', { name: 'Manual', exact: true }).click()
  await dialog.locator('#image-style').selectOption('anime')
  assert.equal(await dialog.locator('#image-prompt').inputValue(), '  My exact manual prompt.\n')
  await dialog.getByRole('button', { name: 'Apply style to prompt' }).click()
  assert((await dialog.locator('#image-prompt').inputValue()).includes('Style: Anime'))
  await dialog.locator('#image-prompt').fill('  A red kite above a lake.\n')

  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    await dialog.locator('#image-prompt').focus()
    await page.waitForFunction(() => document.querySelector('[role="dialog"]').getBoundingClientRect().width > 0)
    const bounds = await dialog.boundingBox()
    assert(bounds.x >= -1 && bounds.x + bounds.width <= width + 1, `Overflow at ${width}px`)
    if (width <= 640) {
      const dragHandle = dialog.locator('button[data-drag-handle="true"]')
      await dragHandle.waitFor()
      assert.equal(await dragHandle.getAttribute('type'), 'button', 'Drag handle must be a button')
      const label = await dragHandle.getAttribute('aria-label')
      assert(label?.includes('dismiss'), 'Drag handle must have accessible dismissal label')
    }
    await page.screenshot({ path: path.join(out, `image-gen-${width}.png`) })
  }
  // Simulate visual-only viewport shrink, as Android keyboards can do.
  await page.setViewportSize({ width: 390, height: 850 })
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport, 'height', { configurable: true, value: 400 })
    window.visualViewport.dispatchEvent(new Event('resize'))
  })
  await dialog.locator('#image-prompt').focus()
  const generate = dialog.getByRole('button', { name: 'Generate image', exact: true })
  const buttonBounds = await generate.boundingBox()
  assert(buttonBounds.y >= 0 && buttonBounds.y + buttonBounds.height <= 401, 'Generate hidden by keyboard')
  await page.screenshot({ path: path.join(out, 'image-gen-keyboard.png') })
  await page.evaluate(() => {
    delete window.visualViewport.height
    window.visualViewport.dispatchEvent(new Event('resize'))
  })
  failImage = true
  await generate.click()
  await dialog.getByRole('alert').waitFor()
  assert((await dialog.getByRole('alert').innerText()).includes('billing'))
  assert.equal(await dialog.locator('#image-prompt').inputValue(), '  A red kite above a lake.\n')
  failImage = false
  await generate.click()
  await dialog.waitFor({ state: 'hidden' })
  const imageRequest = requests.filter((r) => r.url.includes(':generateContent')).at(-1)
  assert.equal(imageRequest.body.contents[0].parts[0].text, '  A red kite above a lake.\n')
  // Persistence: rendered image can be restored from IndexedDB after reload.
  await page.reload()
  await page.getByAltText('  A red kite above a lake.\n', { exact: true }).waitFor()

  await open()
  await dialog.getByRole('button', { name: 'AI ideas', exact: true }).click()
  await dialog.locator('#image-idea').fill('birds')

  // Expand my idea is disabled before selecting visual style
  const expandBtn = dialog.getByRole('button', { name: 'Expand my idea' })
  assert.equal(await expandBtn.isDisabled(), true, 'Expand my idea must be disabled without style selection')

  // Choose style
  await dialog.getByRole('radio', { name: 'Auto / As written' }).click()
  assert.equal(await expandBtn.isDisabled(), false, 'Expand my idea should be enabled after style selection')

  const before = requests.length
  await expandBtn.click()
  await page.waitForFunction(() => document.querySelector('#image-prompt').value.includes('vivid red kite'))
  assert(!JSON.stringify(requests.slice(before)).includes('picnic'))
  holdWriter = true
  await dialog.getByRole('button', { name: 'Create four ideas' }).click()
  await page.waitForFunction(() => document.querySelector('#image-prompt').disabled)
  await page.keyboard.press('Escape')
  pendingWriter?.()
  await dialog.waitFor({ state: 'hidden' })
  await open()
  assert.equal(await dialog.locator('#image-prompt').inputValue(), '')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.screenshot({ path: path.join(out, 'image-gen-reduced-motion.png') })
  assert.deepEqual(errors, [])
  console.log('PASS: production Image Gen · context · four ideas · manual/style · billing · persistence · cancellation · 4 widths · simulated keyboard · reduced motion')
  console.log(`Screenshots: ${out}`)
} catch (error) {
  console.error((await page.locator('body').innerText()).slice(0, 8000))
  console.error('Page errors:', errors)
  await page.screenshot({ path: path.join(out, 'failure.png'), timeout: 5000 }).catch(() => {})
  throw error
} finally {
  pendingWriter?.()
  await app.close()
  await new Promise((resolve) => server.httpServer.close(resolve))
}
