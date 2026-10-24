# Product

<!-- impeccable:product-schema 1 -->

## Platform

web — React/TypeScript/Vite, primarily Android Chrome. Existing Express/PostgreSQL API.

## Users and purpose

Confirmed in the owner's original brief and docs/product-requirements.md: mother operates the family's noodle and bakery stores. Thai interfaces, fast daily sales entry and trustworthy money records; OWNER/MANAGER/STAFF permissions come from the backend.

## Constraints

Online first; Bangkok business dates; integer satang and server-calculated totals. Review store/payment/change before committing. Unknown results keep the original key and payload bound to user/business/store. Never automatically replay after login or identity changes. No fabricated financial reporting. Android physical-device and family usability acceptance remain outstanding.

## Evidence

Product/domain/API/UX specifications live in ../../docs. S2 has real PostgreSQL transaction tests; the existing white/navy shell and Thai typography are incumbent visual authority. This extension implements S3 inside that system, without a redesign.
