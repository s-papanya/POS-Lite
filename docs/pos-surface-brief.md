# S3 POS extension

Scope: extend StoreAccess with catalog, basket, payment, review, receipt and history. Mode: Operate. Product truth is already confirmed in the owner's brief and project requirements; no new product assumptions are introduced. Code-led extension, no new visual world or raster assets.

## Direction contract

THESIS: a Thai shop counter workflow; the operator always knows which store, which bill and whether money was committed.

OWN-WORLD: inherit white/navy, Tahoma/Noto Sans Thai fallbacks, solid actions, quiet dividers and 48px controls from the existing shell. No dashboard metrics or decorative cards.

STORY: choose products, inspect basket, allocate payment, review exact totals, then see the server reference. Unknown results stay read-only until explicitly retried with the same identity/key.

FIRST VIEWPORT: compact identity/connection header, store and Bangkok date, selling/history navigation, searchable menu. Desktop pairs menu with basket; mobile stacks them and keeps a total/action at the viewport edge without covering focus.

FORM: direct extension of the specified UX flow, preserving the incumbent shell at commit 76a63bf (apps/web/src/App.css and index.css). This is an ordinary code-led extension, not a replacement visual world; no concept seed is rolled. Signature interaction: quantities immediately update an exact-money basket; confirmation turns into an immutable receipt only after server success. No entrance animation; reduced motion remains native.

QUALITY BAR: Thai body18px, controls48px, no overflow at360px, readable money alignment, named inputs and live errors; browser fixture evidence must be labeled simulated and kept separate from PostgreSQL evidence.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
