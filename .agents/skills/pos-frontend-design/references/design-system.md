# POS-Lite UI defaults

Defaults for new product UI, not tokens already installed. Preserve approved screens/components;
derive the maintained design system from shipped UI as it matures.

| Semantic token | Initial value | Use |
|---|---|---|
| canvas | #FFFFFF | Main background |
| surface | #F8FAFC | Secondary grouping |
| text | #172B4D | Main Thai text |
| muted-text | #475569 | Supporting labels |
| primary | #1E3A5F | Navy action with white label |
| primary-hover | #16304F | Pressed/hover |
| border | #CBD5E1 | Dividers, not text |
| success | #166534 | Confirmed with text/icon |
| danger | #B42318 | Errors/destructive action |
| warning | #854D0E | Pending/review with label |

Start with `Tahoma, "Noto Sans Thai", sans-serif`; no downloaded font bundled today.
If self-hosting later verify license and Thai glyphs; don't copy Latin-only unicode-range.
Main text18px, line-height1.5–1.6, totals24–32px as needed; tabular/right-aligned amounts.
Spacing4/8/12/16/24/32px, controls at least48px, radius8–12px, restrained borders/shadows.
Validate contrast in actual states, including focus/error/disabled combinations.

## Reuse when screens need it

Inspect components first. Candidates: StoreDayHeader, MoneyField, AccountPicker, QuantityControl,
PaymentSplitForm, TransactionReview, StatusNotice, EmptyState, ReconciliationComparison, CashCountForm.
Keep parsing/server-error/pending identity behavior consistent. Native labeled controls first;
evaluate accessible primitives only for a concrete interaction need.

## CSS and Tailwind

App currently uses CSS. Add semantic custom properties to a shared stylesheet with real product UI.
Tailwind is planned, not installed: check version before choosing its config approach.
Don't create legacy tailwind.config.js or use unexplained utility classes without the toolchain.
Map semantic tokens once; no scattered hex values or parallel token systems.
Keep form state above deferred chunks; consult React/Vite performance guidance only when that task needs it.
