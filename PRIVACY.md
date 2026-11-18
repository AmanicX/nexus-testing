# Privacy Policy

**Effective Date:** January 1, 2026  
**Application:** Eva - Advanced AI Chatbot  
**Repository:** [https://github.com/AmanicX/eva](https://github.com/AmanicX/eva)

---

## Our Privacy Commitment

**Eva is designed with a privacy-first, zero-knowledge architecture.** We believe your thoughts, creative writing, and conversations belong solely to you.

### 1. No Telemetry, No Analytics, No Tracking
- Eva does **NOT** contain any analytics SDKs (e.g., Google Analytics, PostHog, Mixpanel).
- Eva does **NOT** track user identities, device fingerprints, IP addresses, or session durations.
- Eva does **NOT** use tracking cookies or advertising pixels.

### 2. Client-Side Local Storage & Zero-Knowledge Architecture
- All characters, custom world states, conversations, message histories, memory banks, and UI preferences are stored **strictly on your local device**:
  - In web environments: stored via browser `IndexedDB` and `localStorage`.
  - In desktop environments (Electron): stored in your local user data directory.
  - In Android environments (Capacitor): stored within the sandboxed application container.
- None of this data is ever transmitted to a central Eva server because **no central Eva server exists**.

### 3. API Key & Credential Security
- Your API keys (Groq, OpenRouter, OpenAI, etc.) are stored strictly on your local machine.
- Your keys are transmitted **only** to the specific provider endpoint URL that you configure in Settings.
- When using local models (Ollama, LM Studio), network traffic never leaves your local area network (LAN).

### 4. Direct Third-Party Communications
- When you send a message, your client application communicates directly via HTTPS to the API provider you specified.
- The provider receives the message payload and returns streaming tokens. Please review your AI provider's privacy policy (e.g. [Groq Privacy Policy](https://groq.com/privacy/), [OpenRouter Privacy Policy](https://openrouter.ai/privacy), [OpenAI Privacy Policy](https://openai.com/privacy)) to understand how they process prompt data.

### 5. Data Deletion & Export
- You have 100% control over your data.
- You can export your full character and conversation data at any time via **Settings → Data → Export Data**.
- You can permanently wipe all local application data at any time via **Settings → Data → Clear All Data**.

### 6. Children's Privacy
- Eva is intended for adult users (age 18 and older). Eva does not knowingly collect any data from minors.

### 7. Questions
For any questions regarding privacy or to inspect the source code, visit:  
**[https://github.com/AmanicX/eva](https://github.com/AmanicX/eva)**
