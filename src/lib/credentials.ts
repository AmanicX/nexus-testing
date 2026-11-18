/**
 * Cross-Platform Credential & Secret Storage Abstraction for Eva
 *
 * Provides a clean interface for securely storing sensitive credentials (AI provider API keys,
 * OAuth tokens, encryption passphrases) without exposing them in unencrypted backups, Zustand
 * store persistence, or console logs.
 *
 * Supported platforms:
 * - Electron: Backed by Electron's native `safeStorage` (OS Keychain on macOS, Secret Service / libsecret on Linux, DPAPI on Windows).
 * - Android: Backed by Android hardware Keystore AES-256-GCM via native `SecureStorage` plugin.
 * - Web / PWA: Memory-only storage by default. Persistent storage requires explicit user consent.
 */

export interface CredentialStorageInfo {
  isHardwareEncrypted: boolean
  platform: 'electron-safestorage' | 'android-keystore' | 'web-memory' | 'web-persistent'
  description: string
}

let inMemoryApiKey: string | null = null
const inMemorySecrets = new Map<string, string>()

const WEB_PERSISTENCE_CONSENT_KEY = 'eva_allow_web_persistence'

function getDesktopApi() {
  if (typeof window === 'undefined') return undefined
  return (window as any).evaDesktop || (window as any).nexusDesktop
}

function getAndroidSecureStoragePlugin(): any {
  if (typeof window === 'undefined') return undefined
  const cap = (window as any).Capacitor
  if (cap?.isNativePlatform && cap.isNativePlatform() && cap.Plugins?.SecureStorage) {
    return cap.Plugins.SecureStorage
  }
  return undefined
}

/**
 * Checks whether OS-level or hardware-backed credential encryption is available.
 */
export async function isPlatformEncryptionAvailable(): Promise<boolean> {
  const desktop = getDesktopApi()
  if (desktop?.isSecureStorageAvailable) {
    try {
      return await desktop.isSecureStorageAvailable()
    } catch {
      return false
    }
  }

  const androidPlugin = getAndroidSecureStoragePlugin()
  if (androidPlugin) {
    try {
      const res = await androidPlugin.isAvailable()
      return !!res.available
    } catch {
      return false
    }
  }

  return false
}

/**
 * Returns human-readable diagnostic metadata about how secrets are stored on this platform.
 */
export async function getCredentialStorageInfo(): Promise<CredentialStorageInfo> {
  const desktop = getDesktopApi()
  if (desktop?.isSecureStorageAvailable) {
    try {
      const available = await desktop.isSecureStorageAvailable()
      if (available) {
        return {
          isHardwareEncrypted: true,
          platform: 'electron-safestorage',
          description: 'Protected by operating system keychain / credentials manager (Electron safeStorage).',
        }
      }
    } catch {
      // Continue to next check
    }
  }

  const androidPlugin = getAndroidSecureStoragePlugin()
  if (androidPlugin) {
    try {
      const res = await androidPlugin.isAvailable()
      if (res.available) {
        return {
          isHardwareEncrypted: true,
          platform: 'android-keystore',
          description: 'Protected by hardware-isolated Android Keystore (AES-256-GCM).',
        }
      }
    } catch {
      // Continue to next check
    }
  }

  if (isWebPersistenceAllowed()) {
    return {
      isHardwareEncrypted: false,
      platform: 'web-persistent',
      description: 'Stored in browser localStorage (unencrypted). Hardware key isolation is unavailable in browsers.',
    }
  }

  return {
    isHardwareEncrypted: false,
    platform: 'web-memory',
    description: 'Stored in volatile memory for this session only. Credentials will clear upon closing the tab.',
  }
}

/**
 * Checks if browser user has explicitly opted into persistent browser storage.
 */
export function isWebPersistenceAllowed(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(WEB_PERSISTENCE_CONSENT_KEY) === 'true'
}

/**
 * Sets explicit user consent for persistent browser storage.
 */
export function setWebPersistenceAllowed(allowed: boolean): void {
  if (typeof window === 'undefined') return
  if (allowed) {
    window.localStorage.setItem(WEB_PERSISTENCE_CONSENT_KEY, 'true')
  } else {
    window.localStorage.removeItem(WEB_PERSISTENCE_CONSENT_KEY)
    // Clear any stored plaintext web secrets
    window.localStorage.removeItem('eva_api_key')
    const keysToRemove: string[] = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i)
      if (k && k.startsWith('eva_sec_')) {
        keysToRemove.push(k)
      }
    }
    for (const k of keysToRemove) {
      window.localStorage.removeItem(k)
    }
  }
}

/**
 * Retrieves the stored API key, prioritizing hardware/secure storage backends.
 */
export async function getApiKey(): Promise<string> {
  if (inMemoryApiKey !== null && inMemoryApiKey !== '') {
    return inMemoryApiKey
  }

  // 1. Check Electron safeStorage
  const desktop = getDesktopApi()
  if (desktop?.getSecureCredential) {
    try {
      const stored = await desktop.getSecureCredential('api_key')
      if (stored) {
        inMemoryApiKey = stored
        return stored
      }
    } catch {
      // SafeStorage read failed
    }
  }

  // 2. Check Android Keystore
  const androidPlugin = getAndroidSecureStoragePlugin()
  if (androidPlugin) {
    try {
      const res = await androidPlugin.get({ key: 'api_key' })
      if (res?.value) {
        inMemoryApiKey = res.value
        return res.value
      }
    } catch {
      // Android keystore read failed
    }
  }

  // 3. Web: Check explicit persistent storage only if permitted
  if (typeof window !== 'undefined') {
    if (isWebPersistenceAllowed()) {
      const localKey = window.localStorage.getItem('eva_api_key')
      if (localKey) {
        inMemoryApiKey = localKey
        return localKey
      }
    }
  }

  return inMemoryApiKey || ''
}

/**
 * Stores the API key using platform secure storage whenever available.
 */
export async function setApiKey(key: string): Promise<void> {
  const cleanKey = (key || '').trim()
  inMemoryApiKey = cleanKey

  // 1. Electron safeStorage
  const desktop = getDesktopApi()
  if (desktop?.setSecureCredential) {
    try {
      const ok = await desktop.setSecureCredential('api_key', cleanKey)
      if (ok) {
        // Remove any plaintext fallback copies
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem('eva_api_key')
          window.sessionStorage.removeItem('eva_api_key')
        }
        return
      }
    } catch {
      // SafeStorage write failed
    }
  }

  // 2. Android Keystore
  const androidPlugin = getAndroidSecureStoragePlugin()
  if (androidPlugin) {
    try {
      await androidPlugin.set({ key: 'api_key', value: cleanKey })
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem('eva_api_key')
      }
      return
    } catch {
      // Android keystore write failed
    }
  }

  // 3. Web storage: Only persist if user explicitly consented
  if (typeof window !== 'undefined') {
    if (isWebPersistenceAllowed() && cleanKey) {
      window.localStorage.setItem('eva_api_key', cleanKey)
    } else {
      window.localStorage.removeItem('eva_api_key')
    }
  }
}

/**
 * Clears the stored API key across all storage backends.
 */
export async function clearApiKey(): Promise<void> {
  inMemoryApiKey = ''

  const desktop = getDesktopApi()
  if (desktop?.deleteSecureCredential) {
    try {
      await desktop.deleteSecureCredential('api_key')
    } catch {
      // Ignore
    }
  }

  const androidPlugin = getAndroidSecureStoragePlugin()
  if (androidPlugin) {
    try {
      await androidPlugin.delete({ key: 'api_key' })
    } catch {
      // Ignore
    }
  }

  if (typeof window !== 'undefined') {
    window.localStorage.removeItem('eva_api_key')
    window.sessionStorage.removeItem('eva_api_key')
  }
}

/**
 * Stores an arbitrary secret string (e.g. provider tokens).
 */
export async function setSecureSecret(key: string, value: string): Promise<void> {
  inMemorySecrets.set(key, value)

  const desktop = getDesktopApi()
  if (desktop?.setSecureCredential) {
    try {
      const ok = await desktop.setSecureCredential(`sec_${key}`, value)
      if (ok) return
    } catch {
      // safeStorage failed
    }
  }

  const androidPlugin = getAndroidSecureStoragePlugin()
  if (androidPlugin) {
    try {
      await androidPlugin.set({ key: `sec_${key}`, value })
      return
    } catch {
      // Keystore failed
    }
  }

  if (typeof window !== 'undefined' && isWebPersistenceAllowed()) {
    window.localStorage.setItem(`eva_sec_${key}`, value)
  }
}

/**
 * Retrieves a stored secret string.
 */
export async function getSecureSecret(key: string): Promise<string | null> {
  if (inMemorySecrets.has(key)) {
    return inMemorySecrets.get(key)!
  }

  const desktop = getDesktopApi()
  if (desktop?.getSecureCredential) {
    try {
      const val = await desktop.getSecureCredential(`sec_${key}`)
      if (val) {
        inMemorySecrets.set(key, val)
        return val
      }
    } catch {
      // safeStorage failed
    }
  }

  const androidPlugin = getAndroidSecureStoragePlugin()
  if (androidPlugin) {
    try {
      const res = await androidPlugin.get({ key: `sec_${key}` })
      if (res?.value) {
        inMemorySecrets.set(key, res.value)
        return res.value
      }
    } catch {
      // Keystore failed
    }
  }

  if (typeof window !== 'undefined' && isWebPersistenceAllowed()) {
    const val = window.localStorage.getItem(`eva_sec_${key}`)
    if (val) {
      inMemorySecrets.set(key, val)
      return val
    }
  }

  return null
}

/**
 * Removes a named secure secret across all backends.
 */
export async function clearSecureSecret(key: string): Promise<void> {
  inMemorySecrets.delete(key)

  const desktop = getDesktopApi()
  if (desktop?.deleteSecureCredential) {
    try {
      await desktop.deleteSecureCredential(`sec_${key}`)
    } catch {
      // Ignore
    }
  }

  const androidPlugin = getAndroidSecureStoragePlugin()
  if (androidPlugin) {
    try {
      await androidPlugin.delete({ key: `sec_${key}` })
    } catch {
      // Ignore
    }
  }

  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(`eva_sec_${key}`)
  }
}

export const removeSecureSecret = clearSecureSecret

/**
 * Per-provider secure key storage abstraction.
 * Stores keys encrypted per platform without exposing them in unencrypted Zustand stores.
 */
export async function getProviderKey(providerId: string): Promise<string> {
  const secretKey = `provider_key_${providerId}`
  const key = await getSecureSecret(secretKey)
  if (key) return key

  // Fallback for legacy single-key storage if provider is groq
  if (providerId === 'groq') {
    return await getApiKey()
  }
  return ''
}

export async function setProviderKey(providerId: string, key: string): Promise<void> {
  const clean = (key || '').trim()
  const secretKey = `provider_key_${providerId}`
  if (!clean) {
    await clearSecureSecret(secretKey)
    if (providerId === 'groq') {
      await clearApiKey()
    }
  } else {
    await setSecureSecret(secretKey, clean)
    if (providerId === 'groq') {
      await setApiKey(clean)
    }
  }
}

export async function clearProviderKey(providerId: string): Promise<void> {
  return setProviderKey(providerId, '')
}

export async function getCloudflareCredentials(): Promise<{ accountId: string; apiToken: string }> {
  const accountId = (await getSecureSecret('cf_account_id')) || ''
  const apiToken = (await getSecureSecret('cf_api_token')) || ''
  return { accountId, apiToken }
}

export async function setCloudflareCredentials(accountId: string, apiToken: string): Promise<void> {
  const cleanId = (accountId || '').trim()
  const cleanToken = (apiToken || '').trim()
  if (!cleanId) {
    await clearSecureSecret('cf_account_id')
  } else {
    await setSecureSecret('cf_account_id', cleanId)
  }
  if (!cleanToken) {
    await clearSecureSecret('cf_api_token')
  } else {
    await setSecureSecret('cf_api_token', cleanToken)
  }
}

export async function clearCloudflareCredentials(): Promise<void> {
  await clearSecureSecret('cf_account_id')
  await clearSecureSecret('cf_api_token')
}

/**
 * Migrates legacy unencrypted API keys from localStorage into platform secure storage.
 * Verifies successful migration before purging plaintext copies.
 */
export async function migrateLegacyCredentials(): Promise<{ migrated: boolean; error?: string }> {
  if (typeof window === 'undefined') return { migrated: false }

  const legacyKey = window.localStorage.getItem('eva_api_key')
  if (!legacyKey || !legacyKey.trim()) {
    return { migrated: false }
  }

  const hasEncryption = await isPlatformEncryptionAvailable()
  if (!hasEncryption) {
    // Cannot migrate to hardware storage in this environment; retain in memory
    inMemoryApiKey = legacyKey.trim()
    return { migrated: false, error: 'Hardware key storage unavailable on this platform.' }
  }

  try {
    // 1. Write to secure backend
    await setApiKey(legacyKey.trim())

    // 2. Verify retrieval
    inMemoryApiKey = null // Force reload from backend
    const verified = await getApiKey()

    if (verified === legacyKey.trim()) {
      // 3. Verified! Safely remove unencrypted copy
      window.localStorage.removeItem('eva_api_key')
      return { migrated: true }
    } else {
      return { migrated: false, error: 'Verification mismatch during secure storage migration.' }
    }
  } catch (err: any) {
    return { migrated: false, error: err.message || 'Migration to secure storage failed.' }
  }
}
