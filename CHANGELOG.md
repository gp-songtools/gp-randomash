# Changelog

All notable changes to Randomash, newest first. The app has no version numbers, so entries are grouped by date.

## 2026-11-13 — Full songs, vocals, keys and modes; joins the GP Song Tools

### Added

- **Full-song length**: choose a 30-second clip or a full song.
- **Trim**: drag across a clip's waveform to select a section, snap it to beats or bars, preview it as a seamless loop and save it as a WAV with the run. Trimming happens entirely in your browser.
- **Vocals** checkbox: the prompt asks for vocals instead of "instrumental", in the style of the primary genre (growled, rapped, toasting, scat and many more). Stems add a vocals-only part, and the GP Mastering split also separates vocals. Lyrics the model returns are shown under the result.
- **Key**: let Lyria choose, or pick one of the 12 keys, spelled to suit major or minor.
- **Modes**: with Modal key feel, pick any of the seven modes, each with a one-word mood (Dorian · soulful, and so on).
- **ⓘ buttons** beside every field explain what it does, on hover, keyboard focus or tap.
- **Genre chips** show what they add to the prompt on hover: their wording, default tempo and instruments, as primary and as secondary.
- New genres: progressive rock, industrial, nu-metal, thrash metal, illbient, horrorcore, metalcore, death metal, swamp blues, doo-wop and EDM. There are now 138 genres in 14 families.
- **Prepay balance box**: type in the balance AI Studio shows, and Randomash subtracts its estimated cost for each clip Lyria returns. The balance stays visible in the Current mix bar, turning amber when it's low and red at zero, and Generate asks first if a run would go below zero.
- **Changelog** page, and **Changelog**, **Privacy & credits** and **More GP Song Tools** links at the bottom of the page.

### Changed

- Rock and metal are now two families, Rock and Metal. Their chips use shorter labels such as "thrash", while prompts, the mix bar and history keep the full names. Search matches either.
- When your Gemini prepay balance is really empty, Randomash says so instead of retrying the call.
- The seed's explanation is clearer.
- The browser tab now shows Randomash's own icon, 🎲, the same one as on the GP Song Tools menu.
- Randomash now counts visits with Cloudflare Web Analytics: anonymous totals only, with no cookies. It never sees your prompts, clips or key. The Privacy & credits page explains what it reports.

## 2026-11-13 — First release

### Added

- **Genre blender for Lyria 3**: pick from a large list of genres, watch the prompt update live, and generate instrumental clips with your own Gemini API key.
- **🎲 Surprise me** picks two or three genres, weighted towards an interesting clash. A **clash** badge rates the mix as smooth, interesting or chaotic, and warns when too many genres would make it muddy.
- **Shape** controls: tempo, energy, 16 moods, key feel, arrangement and a seed you can lock to regenerate the same recipe.
- The composed **Lyria prompt** is editable, with a reset back to the live version.
- **Stems**: generate drums, bass, chords and melody as separate clips, or generate one mix and split it in your browser with [GP Mastering](https://gp-songtools.github.io/gp-master/)'s stem splitter.
- **Dry run**, on by default, shows the exact request and its estimated cost without calling anything.
- **History** of every run in this browser, with stars, ratings and notes. Click a run to restore its settings, and export or import it as `history.json`. In Chrome or Edge, runs can also be saved to a folder you choose.
- If the safety filter refuses a prompt, the reason appears under Generate and the rest of the page keeps working.
