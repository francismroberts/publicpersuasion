# CLAUDE.md

Instructions for Claude Code working in this repo. Read `README.md` too for the human-facing overview — this file is the operational/conventions layer.

## What this is
A static study dashboard for one Northwestern grad course (Public Persuasion, MSC 482), deployed via GitHub Pages at pp.francismroberts.com. Plain HTML/CSS/JS — no build step, no framework, no bundler.

## Architecture — do not violate these
- **`data.js` is the single source of truth for all course content.** Never hardcode course content (readings, dates, labels) into an HTML file or into `dashboard.js`. If content needs to change, it changes in `data.js` only.
- **`dashboard.js` is the shared rendering engine for every page.** It reads `window.COURSE` from `data.js` and renders the checklist, hero, nav, sidebar, and hub. One file, seven pages (`index.html` + `week1–5.html` + `finish.html`) all load it.
- **`style.css` is shared across every page.** Don't add page-specific `<style>` blocks; add a class to `style.css` instead.
- **Flat file structure at repo root, no subfolders.** Every page links to every asset with a bare relative path (`href="week3.html"`, `href="style.css"`). Moving files into folders breaks the site.
- `CNAME` (containing `pp.francismroberts.com`) must stay at repo root or the custom domain breaks.

## `data.js` item schema
Each course item in `COURSE.items` is one object:
```js
{ id, week, type,          // type: live | reading | lecture | speech | resource | assignment | task
  material, label, url,
  due, dueType,             // dueType: 'deadline' | 'recommended' | 'event'
  required,
  capture,                  // terse "X + Y" note on what to take away
  date,                     // recommended do-on date, shown as "Best timing"
  whyOrder,                 // one sentence on why it's sequenced here
  effort,                   // estimated minutes
  mode,                     // desk | move | flex
  note, parentLecture }     // optional
```

## `COURSE.plan` — the Finish Plan page (`finish.html`, `data-week="6"`)
`finish.html` is not a syllabus week. It renders `COURSE.plan`: an ordered array of day groups
(`{ day, date, entries: [{ id, whyOrder? }] }`) whose entries are **ids into `COURSE.items`**.
- Eight entries deliberately reuse existing Week 4/5 ids so state is shared — checking a step on
  `finish.html` checks the same Supabase row the week page reads, and vice versa. **Never duplicate a
  shared item under a new id to "fix" something on this page.**
- `whyOrder` on an entry is an optional per-plan override, for shared items whose own `whyOrder` was
  written for their original week. `planItems()` in `dashboard.js` merges it onto a **copy**, and also
  stamps the day's `date` onto the copy. **Never mutate objects in `COURSE.items` at render time** —
  weeks 4 and 5 read the same objects and would inherit the override.
- The page's own steps are `week: 6, type: 'task'`, ids prefixed `w6-`. They're execution steps, not
  course material, so `updateHubProgress()` excludes week 6 from the hub's course-progress totals.
- The checklist defaults to the existing `date` group mode here so it reads Monday → Thursday.

## Content-accuracy rules — these matter more than usual for this project
- **Never invent reading content, page ranges, or assignment instructions.** If a claim about a reading or lecture can't be verified against an actual source (OCR'd packet, lecture transcript, assignment PDF), don't include it — flag the gap instead of guessing.
- Several weeks have a known, deliberately-documented mismatch between the syllabus's assigned page ranges and what a lecture actually narrates (e.g. Week 1's Havel/Haagen-Dazs stories, Week 4's Obama speech). These are called out inline in each affected week's "How to Approach" section as `callout callout-warn` boxes. Follow that same pattern if you find a new one — don't silently paper over it.
- Readings link to Google Drive (`drive.google.com/file/d/FILE_ID/view?usp=drive_link`) except Levy's *Accidental Genius*, which has no link (not in Drive, tracked by page range only). Lectures, speeches, resources (PPTs/handouts), and assignments link to Canvas. Live sessions link to Zoom. Don't change which host a category points to without being asked — this was a deliberate, explicit decision made after back-and-forth with the user.
- Zoom links contain `uname=Francis+Roberts` — this is intentional, keep as-is unless asked to change it.

## Testing convention
There's no formal test suite, but before treating any `data.js` or `dashboard.js` change as done, verify headlessly (jsdom is available):
1. `node --check` on every changed `.js` file.
2. Confirm `COURSE.items.length` is still 71 (54 syllabus items + 17 `w6-` plan steps — or the new expected total) and that every item still has all five enrichment fields (`capture`, `date`, `whyOrder`, `effort`, `mode`). If you touched `COURSE.plan`, also confirm it resolves to 25 entries and that every entry id exists in `COURSE.items`.
3. Render each changed page in jsdom, dispatch `DOMContentLoaded`, confirm zero JS errors, and confirm the progress pill's item count matches what's expected for that page (`finish.html`: 25).
4. If you touched shared state, `sbLoadItems()`, or `planItems()`, verify the cross-page contract both ways: toggle a shared id on `finish.html`, confirm it renders checked on `week4.html`/`week5.html`, and back — and confirm the plan's `whyOrder` override did **not** leak onto the week page.
This project has a history of silent count-mismatches (grouped table rows vs. flat item counts, required-vs-all-items counts) — always state which count you're checking and why.

## Known limitations (see README.md for full detail)
- Luntz's *Words That Work* is only verified through the assigned chapters (1–4, 7–8, 10, 12) — don't cite other chapters as if verified.
- Reading page-range gaps exist in Weeks 1 and 4 (documented above).

## Deployment
GitHub Pages, custom domain via `CNAME`. Site is `noindex`'d (`robots.txt` + meta tag) — private study tool, not meant to be discoverable, though the repo itself may be public depending on repo visibility settings.

## Sync backend
Checklist state syncs via Supabase (table `checklist_state`, id/checked/updated_at). The key embedded in `dashboard.js` is Supabase's public/anon-tier key — this is intentional and safe, access control is via Row Level Security, not key secrecy. Falls back to `localStorage` if Supabase is unreachable.
