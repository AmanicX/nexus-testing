<div align="center">

<img src="./src/assets/icon-dark.png" alt="Eva Logo" width="128" height="128" style="border-radius: 28px; box-shadow: 0 12px 32px rgba(0,0,0,0.4);" />

# Eva — Advanced AI Chatbot

**A privacy-first, multi-theme, memory-aware AI character and conversation studio for Desktop, Web, and Android.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Release](https://img.shields.io/badge/Release-v2.0.0-7c5cff.svg)](https://github.com/AmanicX/eva/releases)
[![Platform](https://img.shields.io/badge/Platform-Linux%20%7C%20Windows%20%7C%20Android%20%7C%20Web-4c9aff.svg)](https://github.com/AmanicX/eva/releases)
[![AUR package](https://img.shields.io/badge/AUR-eva--bin-1793d1.svg)](https://aur.archlinux.org/packages/eva-bin)

</div>

---

## Overview

**Eva** is an advanced, native client studio for chatting with and creating multi-dimensional AI characters. Unlike typical single-prompt web interfaces, Eva gives you a complete creative canvas: design deep characters, drop them into evolving worlds, generate detailed personas with natural language AI, and engage in high-immersion roleplay with long-term memory.

Eva is **100% client-side, privacy-first, and uncensored by design**:
- **Bring Your Own Key (BYOK):** Connect directly to [Groq](https://console.groq.com), [OpenRouter](https://openrouter.ai), [OpenAI](https://platform.openai.com), or run fully offline with local models via **Ollama** or **LM Studio**.
- **Zero Telemetry:** No accounts, no analytics SDKs, no tracking cookies, and no intermediary servers. Your API keys, chats, and character libraries stay strictly on your local device.
- **Uncensored Creative Canvas:** No moralizing system overrides or artificial refusals inserted into your fiction.

---

## What's New in v2.0

- 🪄 **AI Character Generator with Section Regeneration:** Describe any character in freeform natural language. Eva crafts a structured 14-field persona (appearance, psychology, backstory, speech patterns, greeting, scenario). Every section features independent regeneration—refine the backstory or greeting with custom prompts while preserving the rest of the character.
- 🪟 **Frosted Glass Acrylic Interface:** Modern translucent design with adaptive blur, subtle border highlights, customized accent palettes, and a blended frameless titlebar on desktop.
- 📱 **Mobile & Android 16 Refinement:** Complete edge-to-edge support with safe-area insets, Android 16 (API 36) runtime compatibility, and a streamlined mobile layout that maximizes vertical chat space.
- 🧠 **Memory & World Simulation:** Dynamic context injection, relationship milestones, notes, and world state variables that evolve across multi-turn roleplay.
- 🛡️ **Built-in Legal & Compliance:** Integrated Terms & Conditions, Privacy Policy, and Open Source Licenses available in Settings.

---

## Modes & Themes

Eva ships with three distinct visual modes, each hand-crafted with tailored typography and accent palettes:

1. **Chatbot** — Minimalist, laser-focused companion and productivity assistant with deep obsidian surfaces and iOS blue accents.
2. **Anime** — Dynamic roleplay studio designed for character storytelling, featuring vibrant violet/pink highlights and backdrop support.
3. **World** — Deep narrative sandbox. Tracks character reputation, world events, factions, and persistent lore across conversations.

---

## Download & Installation

### Arch Linux

#### Option 1: Direct native pacman install (Single command)
Install the official release package directly using `pacman`:
```bash
sudo pacman -U https://github.com/AmanicX/eva/releases/download/v2.0.0/eva-2.0.0.pacman
```

#### Option 2: Build with `makepkg` from source repo
```bash
git clone https://github.com/AmanicX/eva.git
cd eva/aur
makepkg -si
```

#### Option 3: AUR (`eva-bin`)
Once upstream AUR registrations reopen, install via:
```bash
paru -S eva-bin
# or
yay -S eva-bin
```

### Linux (Universal)
Download release assets from [GitHub Releases](https://github.com/AmanicX/eva/releases):
- **AppImage:** Make executable (`chmod +x Eva-2.0.0.AppImage`) and run directly.
- **Debian / Ubuntu:** `sudo dpkg -i eva_2.0.0_amd64.deb`
- **Fedora / RHEL:** `sudo rpm -i eva-2.0.0.x86_64.rpm`
- **Arch package:** `sudo pacman -U eva-2.0.0.pacman`

### Windows
- Download **`Eva-Setup-2.0.0.exe`** from [Releases](https://github.com/AmanicX/eva/releases) and follow the installer prompts.

### Android
- Download **`Eva-android.apk`** from [Releases](https://github.com/AmanicX/eva/releases). Supports Android 8.0 up to **Android 16** (API Level 36).
- On [nexus-testing releases](https://github.com/AmanicX/nexus-testing/releases), **`Eva-android-testing.apk`** is a separate **Eva Testing** app. It installs alongside EVA without replacing its data. Testing builds without persistent signing secrets may require reinstalling **Eva Testing** between releases; export any testing data first.
- If an update says **App not installed**, do not delete your existing chats: see [Android installation and signing](docs/ANDROID_INSTALLATION.md).

### Web App (PWA)
- Eva is installable as a Progressive Web App (PWA) directly from any modern browser with full offline caching.

---

## Quick Start: Connecting a Model

1. Open **Settings** (gear icon in sidebar, or press `Ctrl+,` / `Cmd+,`).
2. Go to **Connection**:
   - **Groq (Recommended for ultra-fast replies):** Enter your Groq API key and select a model (e.g. `llama-3.3-70b-versatile`).
   - **OpenRouter:** Connect with your OpenRouter key to access Claude, GPT-4o, DeepSeek, or open-weights models.
   - **Local (Ollama / LM Studio):** Set Base URL to `http://localhost:11434/v1` or `http://localhost:1234/v1`. No API key required!
3. Click **Test connection** to verify connectivity, then start chatting!

---

## Development

Eva is built with **React 19**, **TypeScript**, **Vite**, **Tailwind CSS**, **Electron**, and **Capacitor**.

### Prerequisites
- Node.js >= 22.0.0
- npm >= 10.0.0

### Setup
```bash
# Clone the repository
git clone https://github.com/AmanicX/eva.git
cd eva

# Install dependencies
npm ci

# Start the web development server
npm run dev

# Start Electron in development mode
npm run electron:dev
```

### Building Installers
```bash
# Compile and build web assets
npm run build

# Package Linux binaries (AppImage, deb, rpm, pacman)
npm run pack:linux

# Package Windows installer
npm run pack:win

# Synchronize Android Capacitor project
npm run cap:sync
```

---

## Legal, Terms & Privacy

- **License:** Distributed under the [MIT License](./LICENSE).
- **Terms & Conditions:** Review our [Terms and Conditions](./TERMS.md).
- **Privacy Policy:** Review our [Privacy Policy](./PRIVACY.md). Eva collects **zero** telemetry and transmits data solely to your configured model endpoint.

---

## Author & Community

- **Repository:** [https://github.com/AmanicX/eva](https://github.com/AmanicX/eva)
- **Author:** [AmanicX](https://github.com/AmanicX)
- Issues, feedback, and pull requests are warmly welcomed!
