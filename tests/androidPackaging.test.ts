import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const readProjectFile = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

describe('Android testing app identity', () => {
  it('keeps debug APKs separate from installed production EVA', () => {
    const gradle = readProjectFile('android/app/build.gradle')
    const debug = gradle.match(/buildTypes\s*\{\s*debug\s*\{([^}]+)\}/)?.[1]
    expect(debug).toMatch(/applicationIdSuffix\s+["']\.testing["']/)
    expect(gradle).toMatch(/applicationId\s+["']com\.nexus\.chatstudio["']/)
  })

  it('labels the separate app so users do not confuse it with their existing EVA', () => {
    const strings = readProjectFile('android/app/src/debug/res/values/strings.xml')
    expect(strings).toContain('<string name="app_name">Eva Testing</string>')
    expect(strings).toContain('<string name="title_activity_main">Eva Testing</string>')
  })

  it('gives each variant a distinct FileProvider authority for side-by-side installation', () => {
    const manifest = readProjectFile('android/app/src/main/AndroidManifest.xml')
    expect(manifest).toContain('android:authorities="${applicationId}.fileprovider"')
  })
})

describe('Android APK publication gate', () => {
  const workspaces: string[] = []
  const script = fileURLToPath(new URL('../scripts/collect-android-apk.sh', import.meta.url))

  afterEach(() => {
    for (const workspace of workspaces.splice(0)) {
      rmSync(workspace, { recursive: true, force: true })
    }
  })

  function fixture(variant = 'debug', packageId = 'com.nexus.chatstudio.testing', signatureValid = true, debuggable = false) {
    const workspace = mkdtempSync(join(tmpdir(), 'eva-apk-test-'))
    workspaces.push(workspace)
    const apk = join(workspace, `android/app/build/outputs/apk/${variant}/app-${variant}.apk`)
    mkdirSync(dirname(apk), { recursive: true })
    writeFileSync(apk, 'fixture APK')
    const tools = join(workspace, 'sdk/build-tools/36.0.0')
    mkdirSync(tools, { recursive: true })
    writeFileSync(join(tools, 'apksigner'), `#!/usr/bin/env bash\nexit ${signatureValid ? 0 : 1}\n`, { mode: 0o755 })
    writeFileSync(join(tools, 'aapt'), `#!/usr/bin/env bash\necho "package: name='${packageId}' versionCode='26'"\n${debuggable ? 'echo application-debuggable\n' : ''}`, { mode: 0o755 })
    return {
      workspace,
      run: (selectedVariant = variant) => spawnSync('bash', [script, selectedVariant], {
        cwd: workspace,
        env: { ...process.env, ANDROID_HOME: join(workspace, 'sdk') },
        encoding: 'utf8',
      }),
    }
  }

  it('publishes a testing APK under a clearly separate filename', () => {
    const { workspace, run } = fixture()
    expect(run().status).toBe(0)
    expect(existsSync(join(workspace, 'out/Eva-android-testing.apk'))).toBe(true)
    expect(readFileSync(join(workspace, 'out/Eva-android-testing.apk.sha256'), 'utf8')).toMatch(/^[a-f0-9]{64}  out\/Eva-android-testing\.apk\n$/)
    expect(existsSync(join(workspace, 'out/Eva-android.apk'))).toBe(false)
  })

  it('publishes verified production APKs with the production filename', () => {
    const { workspace, run } = fixture('release', 'com.nexus.chatstudio')
    expect(run().status).toBe(0)
    expect(existsSync(join(workspace, 'out/Eva-android.apk'))).toBe(true)
  })

  it('refuses a testing APK that would collide with the production app', () => {
    const { workspace, run } = fixture('debug', 'com.nexus.chatstudio')
    const result = run()
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('expected com.nexus.chatstudio.testing')
    expect(existsSync(join(workspace, 'out'))).toBe(false)
  })

  it('fails publication when signature verification fails', () => {
    const { workspace, run } = fixture('debug', 'com.nexus.chatstudio.testing', false)
    expect(run().status).not.toBe(0)
    expect(existsSync(join(workspace, 'out'))).toBe(false)
  })

  it('does not fall back to another variant when the requested APK is missing', () => {
    const { workspace, run } = fixture('debug')
    const result = run('release')
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('Missing APK for selected variant')
    expect(existsSync(join(workspace, 'out'))).toBe(false)
  })

  it('refuses publication if Android verification tools are missing', () => {
    const { workspace, run } = fixture()
    rmSync(join(workspace, 'sdk/build-tools/36.0.0/apksigner'))
    expect(run().status).not.toBe(0)
    expect(existsSync(join(workspace, 'out'))).toBe(false)
  })

  it('rejects a debuggable APK even if it has the production package ID', () => {
    const { workspace, run } = fixture('release', 'com.nexus.chatstudio', true, true)
    const result = run()
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('debuggable APK')
    expect(existsSync(join(workspace, 'out'))).toBe(false)
  })
})

describe('Android release signing selection', () => {
  it.each([
    ['AmanicX/nexus-testing', [], 0, 'has_release_secrets=false'],
    ['AmanicX/eva', [], 1, ''],
    ['AmanicX/nexus-testing', ['ANDROID_KEYSTORE_BASE64'], 1, ''],
    ['AmanicX/nexus-testing', ['ANDROID_KEYSTORE_BASE64', 'KEYSTORE_PASSWORD', 'KEY_ALIAS', 'KEY_PASSWORD'], 0, 'has_release_secrets=true'],
  ])('selects safe signing for %s with secrets %j', (repository, configuredSecrets, status, output) => {
    const workflow = readProjectFile('.github/workflows/release.yml')
    const signingStep = workflow.match(/- name: Validate Release Signing Secrets[\s\S]*?run: \|\n([\s\S]*?)\n        env:/)?.[1]
    expect(signingStep).toBeDefined()
    const workspace = mkdtempSync(join(tmpdir(), 'eva-signing-test-'))
    const githubOutput = join(workspace, 'github-output')
    try {
      const result = spawnSync('bash', ['-c', signingStep!], {
        env: {
          ...process.env,
          GITHUB_REPOSITORY: repository,
          GITHUB_OUTPUT: githubOutput,
          ANDROID_KEYSTORE_BASE64: '',
          KEYSTORE_PASSWORD: '',
          KEY_ALIAS: '',
          KEY_PASSWORD: '',
          ...Object.fromEntries(configuredSecrets.map((key) => [key, 'fixture-value'])),
        },
        encoding: 'utf8',
      })
      expect(result.status).toBe(status)
      if (output) expect(readFileSync(githubOutput, 'utf8')).toContain(output)
    } finally {
      rmSync(workspace, { recursive: true, force: true })
    }
  })
})
