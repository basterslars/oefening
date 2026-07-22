# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Friettent Roostermaker ("fry stand scheduler") — a single-page, single-file web app for scheduling
employee shifts at a Dutch fry stand ("friettent"). The entire app — markup, CSS, and JavaScript —
lives in one file: `index.html`. There is no build step, no package manager, no dependencies, and
no test suite.

## Development workflow

- **Run it**: open `index.html` directly in a browser (e.g. `file:///.../index.html`), or serve the
  directory with any static file server (`python3 -m http.server`). There is no dev server, bundler,
  or hot reload configured.
- **Build/lint/test**: none exist. There are no npm scripts, config files, or CI. Verify changes by
  opening the file in a browser and exercising the UI manually.
- **Persistence**: all data lives in the browser's `localStorage` (see keys below). There is no
  backend — testing means checking behavior in a real browser, since `localStorage` and `Date`/week
  math don't work under a plain file read.

## Architecture

Everything is in `index.html`, organized as three top-level sections in a single IIFE script at the
bottom of the file:

1. **Static config** — `TASKS` (job roles like kassa/friet/snack/bakplaat/fietsbezorgen/
   autobezorgen/vliegende_keep), `DAYS` (Tuesday–Sunday; the stand is closed Monday, so there is no
   "maandag" entry), and `DEFAULT_REQUIREMENTS` (how many people per task per day). Changing the
   business rules (open days, task list, default staffing) means editing these constants.
2. **Storage layer** — thin wrappers around `localStorage` under `STORAGE_KEYS`:
   - `friettent_employees` — the employee list
   - `friettent_requirements` — per-day/per-task staffing requirements (falls back to
     `DEFAULT_REQUIREMENTS` if unset)
   - `friettent_schedule_<ISO-week>` — one saved schedule per ISO week string (e.g. `2026-W30`)
   `normalizeEmployee` back-fills missing fields (e.g. `dienstType`) for data saved by older versions
   of the app, since there is no schema migration mechanism otherwise.
3. **UI + app logic**, split across three tabs that map directly to three DOM sections
   (`#tab-medewerkers`, `#tab-bezetting`, `#tab-rooster`):
   - **Medewerkers (Employees)**: add/edit/delete employees, each with a name, a set of `taken`
     (tasks they can perform), `vasteDagen` (fixed working days) each tagged with a `dienstType` of
     `heledag` (full day) or `avondspits` (evening rush only), and `verlof` (specific requested leave
     dates). Also handles JSON export/import of the full `{ employees, requirements }` state.
   - **Bezetting (Staffing requirements)**: an editable grid of how many people are needed per
     task/day; saved into `requirements`.
   - **Rooster (Schedule)**: pick an ISO week, then `generateSchedule()` produces an assignment.
     Scheduling algorithm: for each day, tasks are sorted by scarcity (available qualified,
     available-that-day, not-on-leave candidates minus required count) so the hardest-to-fill task
     is assigned first; within a task, candidates are sorted by fewest shifts already assigned this
     week (load balancing), then by name. Unfilled slots become `null` and generate warnings.
     Generated schedules are editable via per-slot `<select>` dropdowns and are re-saved to
     `localStorage` on every change, with visual flags for slots assigned to someone not on their
     fixed day (`not-fixed-day`), on leave (`on-verlof`), or on an avondspits-only day
     (`avondspits`), and understaffed cells highlighted.

## Conventions

- UI language and all in-code Dutch terms (medewerker=employee, dagen=days, verlof=leave/vacation,
  bezetting=staffing, rooster=schedule, avondspits=evening rush shift, heledag=full day) are
  intentional domain language — keep new UI text and variable names consistent with the existing
  Dutch terminology rather than mixing in English.
- No frameworks or external libraries are used; DOM is built with plain `document.createElement`/
  `innerHTML`. Keep additions dependency-free and within the existing single-file structure unless
  asked to restructure the project.
- Dates are handled as ISO strings and via `Date.UTC`-based week math (`isoWeekStringFor`,
  `computeWeekDates`) to avoid timezone drift — reuse these helpers rather than doing ad hoc date
  arithmetic.
