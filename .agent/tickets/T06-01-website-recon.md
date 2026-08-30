# T06-01 — Website Builder recon
Status: TODO
Owner: worker-code
Spec: specs/06-website-builder.md
Depends: —
# Goal: Pure recon — no production code. Read server/db.ts hotel_media existing read path, specs/06 data model, client/src/pages/PublicHotel.tsx current fixed copy/colors, server/_core/storageProxy.ts upload support. Decide: hotel_media write path (use existing Supabase storage bucket vs new), hotel_site_config table design (hero_copy, accent_color, visible_sections jsonb or booleans), custom domains defer decision. Write to .agent/DECISIONS.md + .agent/recon/REPORT.md T06-01 with file:line evidence. Log hotel_domains defer note if deferring.
