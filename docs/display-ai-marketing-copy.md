# FOON display AI marketing copy

The display manager can request a structured multilingual copy draft for a product or service. The request is tenant-scoped and requires an authenticated owner/manager with the `display_advertising` entitlement.

## Behavior

- Uses the selected live menu/catalog source when available, including its current name, description, category and price; a merchant may also enter a product/service name for a media-only creative.
- Produces Arabic, English and French title, subtitle and short badge suggestions.
- The prompt explicitly prohibits inventing discounts, ingredients, certifications, availability, ratings or product benefits.
- Generated text is returned as an editable draft. It is not saved to a slide or published until the merchant presses the existing Add advertisement action.
- If `OPENAI_API_KEY` is absent, the endpoint returns `AI_NOT_CONFIGURED`; the key is never sent to the browser. `OPENAI_MODEL` is optional and defaults to `gpt-4o-mini`.
- The endpoint uses same-origin validation, bounded JSON input, tenant membership and plan entitlement checks. Provider failures return generic error codes without exposing provider response bodies.

## Privacy and rollout

Only the product/service fields submitted by the merchant are sent to the configured AI provider. Do not send customer information, order history, or private customer content. Configure and approve the provider/key and applicable data-processing terms before enabling this feature in production. The feature does not change production environment values, database data, or deployment settings.

## Validation

Run `npm run test:display-advertising`, `npm run typecheck`, and `npm run build`. Tests verify tenant/entitlement guards, bounded input, multilingual output contract, and the explicit review-before-save flow.


## FOON catalog description assistant

The same authenticated endpoint also supports `purpose: "menu_description"` for product and service descriptions in the activity catalog editor. This mode is available to authorized tenant owners/managers independently of the display-advertising plan entitlement; display-copy generation remains gated by that entitlement.

The catalog editor sends only the item name, existing description, activity code, category, and selected UI language. Suggestions are placed into editable description fields and are not saved until the merchant submits the normal product/service form.

The merchant experience is intended to be free (no personal API key or separate subscription). FOON still bears inference/provider costs; the current implementation requires the server-side `OPENAI_API_KEY` and returns `AI_NOT_CONFIGURED` when it is absent. Therefore this PR does **not** claim zero-cost or unlimited generation. Production enablement requires FOON to configure and budget the provider, apply rate limits/quotas, and publish a retention/privacy policy. The key is never sent to the browser.
