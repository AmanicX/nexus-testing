# EVA v2.5.1 — Image Gen Polish

## Added
- Prominent visual style selection before AI prompt generation and idea expansion, with an explicit "Auto / As written" option.
- Enhanced motion: animated mode transitions, interactive style selection feedback, remounting concept entrance animations on refresh, and coordinated loading skeletons.
- Deep integration of EVA's active accent color tokens across mode tabs, visual styles, concept cards, and focus states.
- Format-aware image downloads preserving actual PNG, JPEG, and WebP extensions.
- Storage durability and automatic cleanup of orphaned IndexedDB image records on message/chat deletion.
- Native, keyboard-accessible mobile modal drag/dismiss handle.

## Fixed
- Changing styles now invalidates stale concepts and deselects old suggestions while strictly preserving manually typed prompt text.
- Malformed responses during idea expansion now report operation-specific single-prompt validation errors rather than four-concept errors.
- Resolved AI prompt writer hydration edge cases where async provider readiness could leave the writer unselected.
- Await IndexedDB transaction completion (`tx.oncomplete`) and revoke unused object URLs on deletion to prevent memory leaks.

## Compatibility and verification
- Existing chats, settings, credentials, launchers, and image storage remain preserved.
- Android version code increases to 30.
- Unit/integration suite (133 tests across 23 files) and production Electron/Chromium UI checks pass.
- Website, shared website assets, and hosted `docs/app/` files are unchanged.

Installers are supplied for Windows, macOS, Linux, and Android.
`SHA256SUMS.txt` contains download checksums.

