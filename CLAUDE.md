# CLAUDE.md

## Project
- Randomash: genre blender for Google's Lyria 3 (Gemini API), one of the GP Song Tools
- Live: https://gp-songtools.github.io/gp-randomash/ (GitHub Pages, `main` branch, root)
- Static: no build step, no package.json, no tests dir; plain scripts loaded in order (`mix.js`, `lyria.js`, `store.js`, `app.js`)

## Directory map
- `index.html`, `styles.css`, `app.js` — page, styles (GP Mastering palette), UI and state
- `mix.js`, `genres.json`, `lyria.js`, `store.js` — clash scoring + prompt template, genre data, Gemini/Lyria client (`LYRIA` config), IndexedDB/folder/history.json
- `split.html` — hidden iframe bridge running gp-master's splitter unmodified via `<base href="../gp-master/">`
- `changelog.html` (renders `CHANGELOG.md`; edit only the `.md`), `README.md` (full page description), `.nojekyll`
- `tools/dry-run.js` — Node script printing Surprise me prompts; no API calls

## Commands
- Serve (with gp-master beside it for the splitter): from a folder holding both repos, `python3 -m http.server 8000 >/dev/null 2>&1 &` → `http://localhost:8000/gp-randomash/`
- Syntax check: `for f in *.js tools/*.js; do node --check "$f" || echo "FAIL $f"; done`
- Prompt check: `node tools/dry-run.js 5`
- UI check: Playwright + Chromium preinstalled; keep Dry run on (default) or mock `generativelanguage.googleapis.com` with `page.route`; fail on `pageerror`/console errors

## Rules
- Add a `CHANGELOG.md` entry in the same commit as every user-facing change: today's date heading (reuse it if already at the top), Added / Changed / Fixed, plain user wording; also update README "The page, described" when behavior changes
- `index.html` and `changelog.html` end with the Cloudflare Web Analytics snippet (same token as all GP Song Tools); `split.html` is a hidden iframe and has none (it would double-count visits)
- Tab icon is 🎲 (inline SVG `<link rel="icon">`), matching the GP Song Tools menu card
- Privacy & credits live on the suite page `gp-songtools.github.io/toolsmenu/privacy.html` (repo `gp-songtools/toolsmenu`); update it and README "Privacy & credits" when changing what is sent, stored or credited
- Gemini key: in memory by default; saved to `localStorage` only while Remember (`#keyRemember`, off by default) is ticked; sent only in the `x-goog-api-key` header, never in URLs, logs or errors
- `localStorage` keys: `randomash.key.v1` (Remember only), `randomash.balance.v1`, `randomash.ui.v1`; IndexedDB `randomash`; always wrap storage in try/catch
- Never change gp-master to suit this app; `split.html` relies on gp-master's `sep-pool.js`, `sep-worker.js`, `ort/` and `models/` paths staying where they are (gp-master's CLAUDE.md notes this too)
- Prompts are US English and never name artists; Dry run stays on by default
- Check layout at 390 px and 1440 px; `document.documentElement.scrollWidth` must equal the viewport width

## Git workflow
- Workflow not yet set by the owner: use a branch + pull request to `main` unless told otherwise
- Run the syntax check and a UI check before every push
