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
