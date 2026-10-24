---
name: pos-frontend-design
description: Design, implement or review POS-Lite Thai mobile interfaces, tokens, forms and reusable transaction components. Use for product UX and styling, not generic landing pages or backend-only changes.
---

# POS-Lite frontend design

Read affected [UX flows](../../../docs/ux-flows.md) and [requirements](../../../docs/product-requirements.md).
Inspect existing UI/CSS/components, then [design defaults](references/design-system.md) when styling.
Current UI has cookie login/store selection, POS basket/payment/review/receipt/history and white/navy CSS tokens.
Reuse apps/web/src/pos, api.ts and existing CSS; Tailwind and a component library are not installed.
Receipt/history distinguish POS, SUPPLEMENTAL and RECONCILIATION; preserve Thai action meanings and reasons.
Pending checkout lives in sessionStorage by user/business/store and retries only the original key/request
on explicit action after identity checks. Do not replace it with localStorage auth or automatic replay.
POS and daily flows aggregate WorkState in PosWorkspace; keep DailyWorkspace mounted when its tab is hidden.
Daily storage uses the checkout identity prefix plus :daily, so store discard/logout must check and clear both.
A pending flow blocks new writes in the other flow, while original-key retry and history remain available.
Reconciliation edits/reload/STALE_PREVIEW invalidate unconfirmed previews; preserve the original preview,
revision and targets with a pending confirm. Never refresh a pending payload silently.
Keep POS success messages out of daily forms; show account loading/empty recovery and store/date in review.
Reuse existing components. Don't install UI/router/chart/icon libraries or replace the stack merely to match a comp.

## Task before screen

Identify the mother's current action, decision data and commit/retry/permission outcome.
Home prioritizes selling, additional sales, expenses, closing and history; don't start with decorative analytics.
Use white/navy operational UI with store/date → task → totals → confirmation hierarchy.
Shape each workflow: quantity controls for POS, comparison rows for reconciliation, expected/count/difference for closing.
Avoid identical KPI card grids for every page. Use Thai typography/spacing/alignment for character;
avoid gratuitous gradients/glass/stock heroes/oversized rounded cards or distracting motion.

Show store/date during money entry; store change with draft needs explicit keep/discard/stay decision.
Review shows store, amount, channel, account, discount/change and action type before commit.
Distinguish “เพิ่มยอดที่ยังไม่ได้บันทึก” from “ตรวจยอดขายรวมทั้งวัน”; daily actual is net after refunds.
Don't guess accounts, hide negative net targets, change sales for cash shortage or call incomplete costing net profit.

## States

Design loading/empty/validation/server/offline/session-expired/committed/unknown-timeout states.
Success needs server reference; unknown outcome retries same key/payload bound to original user/business/store.
No automatic replay under another identity; recheck access/intent after login.
Don't clear money-entry state when merely sent or remount drafts in lazy-loading boundaries.
Price changes/stale previews show refreshed totals and require explicit confirmation.
Closed days show history; privileged corrections require reason/audit through backend.
Disabled buttons help UX but aren't auth or idempotency controls.

## Verification

Thai main text at least18px, touch targets at least48px, visible focus, labels/error association,
text/icon alongside color, announced async status, reduced motion when animated.
Check360px width, Android keyboard/large text, long names, large/negative amounts, split pay and slow network.
No horizontal scrolling selling forms; keep actions/totals reachable without hiding focus.
Validate contrast for actual token combinations. Exact money formatting must not round satang through Number;
don't POST formatted baht strings.
Preview representative states with actual fixtures where available, recording dimensions and limits.
No invented financial report numbers or claim Android tested from desktop build alone.
