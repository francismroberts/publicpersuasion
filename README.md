# Public Persuasion — Study Dashboard

A personal study dashboard for **Public Persuasion (MSC 482)**, Northwestern's Hybrid Leadership Program, taught by Prof. Jason DeSanto (Summer 2026).

**Live site:** [pp.francismroberts.com](https://pp.francismroberts.com)

> This is a private study tool for one student's own use — not affiliated with or endorsed by Northwestern University. It's excluded from search engines (`robots.txt` + `noindex`), but the repo itself is public, so treat anything in here accordingly.

---

## What it does

- A weekly checklist for all 54 required/optional items across the 5-week course (readings, lectures, speeches, live sessions, assignments), each tagged with recommended timing, estimated effort, and why it's sequenced where it is
- A **Finish Plan** page — one linear, day-by-day list for the last four days of the term, which reuses the relevant Week 4/5 items by id rather than copying them, so checking a step there checks it on its week page too
- A home dashboard with course-wide schedule, pinned deadlines, and per-week progress
- Per-week study content: "How to Approach," Big Ideas, Master Notes, and copy-ready NotebookLM prompts — all grounded in the actual lecture transcripts and readings, not generic summaries
- Checklist state syncs across devices via Supabase, so checking something off on your phone shows up on your laptop
- Installable as a home-screen app on iOS/Android (`manifest.json`)

## Architecture

Plain HTML/CSS/JS — no build step, no framework, no bundler. Open any `.html` file directly or serve the folder statically.

| File | Role |
|---|---|
| `index.html` | Home / hub page |
| `week1.html` – `week5.html` | One page per week |
| `finish.html` | Finish Plan — a day-by-day execution list for Aug 24–27, rendered from `COURSE.plan`. Its entries are ids into `COURSE.items`, so the eight shared Week 4/5 steps are the *same* items, not copies. |
| `data.js` | **Single source of truth.** All course content lives here as one array of item objects — see schema below. Nothing else hardcodes course content. |
| `dashboard.js` | Shared rendering engine. Reads `data.js`, builds the checklist/hero/nav/sidebar, handles Supabase sync, drag-to-reorder, hide/show, and all interactivity. Same file powers every page. |
| `style.css` | Shared styles (Northwestern-purple theme) for every page. |
| `manifest.json`, `favicon.*`, `icon-*.png`, `apple-touch-icon.png` | PWA / home-screen install support. |
| `og-image.png` | Social link-preview image (Open Graph / Twitter Card). |
| `robots.txt`, `<meta name="robots">` in each page | Blocks search engine indexing. |
| `CNAME` | Required by GitHub Pages to serve the custom domain. |

### Content data model (`data.js`)

Each course item is one object in `COURSE.items`:

```js
{
  id, week, type,       // type: live | reading | lecture | speech | resource | assignment | task
  material, label, url,
  due, dueType,         // dueType: 'deadline' | 'recommended' | 'event'
  required,
  capture,               // terse "X + Y" note on what to take away
  date,                  // recommended do-on date, shown as "Best timing"
  whyOrder,               // one sentence on why it's sequenced here
  effort,                 // estimated minutes
  mode,                   // desk | move | flex
  note, parentLecture     // optional
}
```

`COURSE.plan` sits alongside `COURSE.items` and holds the Finish Plan's day-by-day ordering as ids into that array, plus optional per-plan `whyOrder` overrides (applied to a copy, so the week pages are unaffected).

To edit a reading's link, a due date, or add a new week, this is the only file that needs to change — `dashboard.js` and every page render from it automatically.

## Sync backend

Checklist state (which items are checked) syncs via [Supabase](https://supabase.com) — a single `checklist_state` table (`id text primary key, checked boolean, updated_at timestamptz`), read/written from `dashboard.js` using Supabase's REST API directly (no SDK dependency beyond the CDN-loaded `@supabase/supabase-js` for realtime).

The key embedded in `dashboard.js` (`sb_publishable_...`) is Supabase's public/anon-tier key — it's meant to be exposed client-side by design. Actual access control is enforced by Row Level Security policies on the table, not by hiding this key. State also falls back to `localStorage` if Supabase is unreachable, so the checklist still works offline or if the backend is ever torn down.

## Known limitations

- Reading page ranges occasionally have small gaps against what a given lecture actually narrates (flagged inline in the affected weeks' "How to Approach" sections) — the syllabus's assigned pages and the professor's lecture references don't always perfectly overlap.
- Luntz's *Words That Work* is only verified through Chapters 1–4, 7–8, 10, and 12 (the assigned chapters) — other chapters aren't represented.
