# Changelog

All notable changes to Randomash, newest first. The app has no version numbers, so entries are grouped by date.

## 2026-11-13 — Joins the GP Song Tools

### Added

- **Prepay balance box**: type in the balance AI Studio shows, and Randomash subtracts its estimated cost for each clip Lyria returns. A badge in the header shows roughly what's left, turning amber when it's low and red at zero, and Generate asks first if a run would go below zero.
- **Changelog** page, and **Changelog**, **Privacy & credits** and **More GP Song Tools** links at the bottom of the page.

### Changed

- When your Gemini prepay balance is really empty, Randomash says so instead of retrying the call.
- The browser tab now shows Randomash's own icon, 🎲, the same one as on the GP Song Tools menu.
- Randomash now counts visits with Cloudflare Web Analytics: anonymous totals only, with no cookies. It never sees your prompts, clips or key. The Privacy & credits page explains what it reports.

## 2026-11-13 — First release

### Added

- **Genre blender for Lyria 3**: pick from 127 genres in 13 families, watch the prompt update live, and generate 30-second instrumental clips with your own Gemini API key.
- **🎲 Surprise me** picks two or three genres, weighted towards an interesting clash. A **clash** badge rates the mix as smooth, interesting or chaotic, and warns when too many genres would make it muddy.
- **Shape** controls: tempo, energy, 16 moods, key feel, arrangement and a seed you can lock to regenerate the same recipe.
- The composed **Lyria prompt** is editable, with a reset back to the live version.
- **Stems**: generate drums, bass, chords and melody as four separate clips, or generate one mix and split it in your browser with [GP Mastering](https://gp-songtools.github.io/gp-master/)'s stem splitter.
- **Dry run**, on by default, shows the exact request and its estimated cost without calling anything.
- **History** of every run in this browser, with stars, ratings and notes. Click a run to restore its settings, and export or import it as `history.json`. In Chrome or Edge, runs can also be saved to a folder you choose.
- If the safety filter refuses a prompt, the reason appears under Generate and the rest of the page keeps working.
