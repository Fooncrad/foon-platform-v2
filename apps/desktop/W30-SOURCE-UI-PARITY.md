# FOON Windows W30 — Real cloud source visual parity pass

Source reference: main commit `5e1b369d660b197bf645cc52dc7de7f01d07443a`. This branch is based on W28 and does NOT merge to main, change production SQL, or enable cloud synchronization.

## What was corrected from the real FOON sources
- Added the previously missing original `reference-dashboard-layout.css`, `shared-dashboard-legibility.css` and `workspace-theme-control.css`, unchanged at the **exact original Git blob SHAs**.
- The original 7-file styling cascade is loaded on the local console. The newer white merchant sidebar, pink activity accent and 254px workspace from the reference design take precedence over W28's old navy sidebar.
- Local menu navigation uses the same six task groups and Arabic/English/French labels as `lib/ux/merchant-navigation.ts`, populated only from roles permitted by the existing server session. Non-ported modules remain visibly disabled.
- Sidebar brand/context, POS catalog/checkout structure, compact header, mobile drawer, language switch and appearance (system/light/dark) are adapted to the merchant reference CSS classes.
- The no-cloud-sync warning is explicit; users cannot mistake a pending local Outbox row for a completed upload.
- A static test verifies all seven source CSS blob hashes and presence of the corresponding UI class structure: `node scripts/test-w30-source-ui.mjs`.

## Scope and remaining gaps

These changes improve **design source alignment**. They do **not** deliver 100% pixel parity or product functional parity. The HTML console still uses local DOM adapters, not the original React `MerchantDashboard`, `OrderWorkspace`, `WorkspaceThemeControl`, etc. It does not yet support all original form layouts, charts, dialogs, font loading, staff features, payments, bookings, VAT or printer workflows. No Windows screenshot regression against the live merchant reference was executed by these tool actions.

Only the original W27 `pos`, `orders`, `kds` synthetic offline flows function. Unimplemented sections cannot be enabled by styling. W28 7-hour offline lease and its existing constraints are unchanged. Commercial shipping remains blocked by W11 source-exposure and unfinished operational requirements.

## Windows workstation safety

For existing `C:\Users\ejaan\Desktop\nfoodzwindowz\FOON-Windows-W27-ONE-FOLDER`, upgrade only the selected static JS/CSS/HTML manifest files inside `SOURCE-W28` **after stopping W28**, taking a rollback copy of each. Never overwrite `SOURCE` (W27), `W28-TOOLS`, `%LOCALAPPDATA%\FOON\W28-DEVELOPMENT-ONLY` (SQLite, WAL, Outbox, credentials), or the W29 recovery tool. New source snapshot files may be added under the existing vendored CSS folder.
