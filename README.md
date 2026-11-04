# Texas 6 BBQ

Website for Texas 6 BBQ, a family owned and operated BBQ caterer in Waco, TX (Casey & Jammie Hall).

- **Site:** `index.html`, `assets/site.js`, `img/`. Plain static files served by GitHub Pages.
- **Admin portal:** `/admin/` lets admins edit menu prices, photos and videos, every line of wording, Facebook posts, and who has access.
- **Data:** Supabase (Postgres + Storage + Auth + Edge Functions). The site ships with complete built-in content and falls back to it if the database is unreachable.

## How it fits together

| Piece | Where | Notes |
| --- | --- | --- |
| Wording | `site_text` table | Keys match `data-edit="…"` attributes in `index.html`. `**bold**` and line breaks are supported. |
| Menu & prices | `menu_items` table | Meats: whole / half / per-lb. Sides: pan price. Drives both the menu and the estimate builder. |
| Carousel | `media` table + `media` storage bucket | Admin uploads resize photos to 1600 px and grab a poster frame for videos. |
| Facebook | `fb_posts` table, `fb-sync` function | Synced hourly by `pg_cron`. Until a Page token is set, the site shows Facebook's Page Plugin widget instead. |
| Admins | `admins` table, `manage-admins` function | Only emails in `admins` can write (enforced by row level security). |

## Reading prices from posts and flyers

New Facebook posts (and flyers uploaded on the Menu tab) are read by Claude via `read-prices` / `fb-sync`. Found prices become a **pending suggestion** in the admin portal; nothing changes on the site until an admin taps **Apply to menu** (replace the menu, or add to it). Needs an `ANTHROPIC_API_KEY` secret in Supabase. Optional `ANTHROPIC_MODEL` overrides the default model.

## Facebook photos and videos

Each synced post in the admin Facebook tab has **Add photo/video to the site**, which copies it into Storage and the carousel (`import-fb-media`).

## Connecting Facebook auto-sync

1. A Page admin creates a Meta app at developers.facebook.com and generates a long-lived **Page access token** with `pages_read_engagement`.
2. Save it in Supabase → Edge Functions → Secrets as `FB_PAGE_TOKEN`, and set `FB_PAGE_ID` to `100092064403815`.
3. Press **Sync now** in the admin portal's Facebook tab. After that it runs every hour.

## Editing the design

The page design lives in the `texas6` working folder (`src/site.html`, `src/base.css`); `build.py` assembles `index.html`. Content edits should go through the admin portal, not the HTML.

## Notes

- Free Supabase projects pause after a week with no traffic. Site visits and the hourly sync keep it awake; if it does pause, the site still shows its built-in content until it's restored from the Supabase dashboard.
