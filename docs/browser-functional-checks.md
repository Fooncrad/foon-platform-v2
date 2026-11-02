# Functional browser checks and screenshot artifacts

The merchant browser suite retains all functional, authorization, tenant, ordering, locale and layout assertions when screenshots are disabled. Screenshots remain enabled by default.

If a local headless browser hangs while capturing images, run the existing configured test-database workflow with `FOON_BROWSER_SCREENSHOTS=0`. This skips only image artifact capture, not assertions. It does not constitute visual screenshot approval or real-device acceptance.

For an already prepared, isolated local test environment:

```bash
FOON_BROWSER_SCREENSHOTS=0 npm run test:browser
```

```powershell
$env:FOON_BROWSER_SCREENSHOTS = '0'
npm run test:browser
Remove-Item Env:FOON_BROWSER_SCREENSHOTS
```

Use the repository's required disposable local test database and seed workflow; never point integration tests at production. A filtered test or functional-only pass must be reported with its actual scope. Capture and inspect screenshots separately on a supported browser environment before claiming visual acceptance.
