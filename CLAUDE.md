# Randomash: notes for Claude

- **What it is**: static genre blender for Google's Lyria 3 (Gemini API), hosted on GitHub Pages at `gp-songtools.github.io/gp-randomash/`. No server, no build step, no package manager.
- **Directory map**
  - `index.html`, `styles.css`, `app.js`: page, styles, UI (picker, controls, prompt, generation, players, history, balance)
  - `mix.js`: genre index, pair clash, Surprise me, prompt template; UMD, also runs in Node
  - `lyria.js`: API client; the `LYRIA` object at the top is the one place for model IDs (`LENGTHS`: clip and full song, with 404 fallbacks), prices, endpoint and retries
  - `store.js`: IndexedDB `randomash` (stores `runs`, `audio`, `meta`), optional output folder, history.json import/export
  - `split.html`: bridge that runs gp-master's stem splitter via `<base href="../gp-master/">`
  - `genres.json`: 138 genres in 14 families (bpm, energy, acoustic, clash, instruments, optional label and vocals; families have `near` and a default `vocals`)
  - `tools/dry-run.js`: prints Surprise me prompts with no API calls
  - `CHANGELOG.md` (user-facing changes by date) and `changelog.html` (renders it in the browser; edit only the `.md`)
- **Commands**
  - Serve (needs gp-master beside it for the splitter): from a folder holding both repos, `python3 -m http.server 8000`, then open `http://localhost:8000/gp-randomash/`
  - Syntax check: `for f in app.js mix.js lyria.js store.js tools/dry-run.js; do node --check $f; done`
  - Validate genres: `node -e "JSON.parse(require('fs').readFileSync('genres.json'))"`
  - Prompt review: `node tools/dry-run.js 5`
  - Browser tests: Playwright with `page.route('https://generativelanguage.googleapis.com/**')` mocks; never make real Lyria calls in tests
- **Rules**
  - Real Lyria calls cost money: never make one without the owner's go-ahead; Dry run stays on by default
  - API key lives only in the browser (memory, or `randomash.key.v1` when Remember is ticked); send it only in the `x-goog-api-key` header, never in a URL, log, error text or commit
  - Prompts: US English, never name real artists or imitate voices
  - Vocals are off by default ("instrumental"); with Vocals on the prompt uses the primary genre's style (genre `vocals` in genres.json, else the family's `vocals`, else "with vocals"). Every style starts with "with", contains "vocal" and has no commas: `VOICE_RE` in mix.js relies on it to find and swap the clause, stems add a vocals-only part and gp-master also splits vocals; instrument stems always stay instrumental
  - localStorage keys: `randomash.ui.v1`, `randomash.key.v1`, `randomash.balance.v1`; don't change a key's format without migrating it
  - Balance is an estimate (amount entered minus the chosen length's `costUsd` per returned clip); kept apart from history so deleting runs never refunds
  - Trim runs entirely in the browser (Web Audio decode, WAV export); it must never call the API
  - Requests stay sequential; retries only for transient errors, never for an empty prepay balance (402/429 "prepayment credits are depleted")
  - Match the gp-master palette and font; colors only via CSS vars on `:root` with the dark-mode overrides
  - Do not modify `gp-songtools/gp-master` without asking the owner; Randomash uses its files as published
  - No limit on genres per family (owner's decision); don't pad or trim families to a size
  - Genre `name` is the full term used in prompts, history and the mix bar; optional `label` is the shorter chip text inside its family (e.g. "thrash" under Metal); search matches both
  - Update `README.md` when a user-facing feature is added or renamed
  - Add a `CHANGELOG.md` entry in the same commit as every user-facing change: today's date heading (reuse it if already at the top), Added / Changed / Fixed, plain user wording
  - `index.html` and `changelog.html` end with the Cloudflare Web Analytics snippet (same token as all GP Song Tools); `split.html` is a hidden iframe and has none (it would double-count visits)
  - The tab icon uses a teal Randomash initial from the homepage branding; the footer links to Changelog, the suite Privacy & credits page and the tools menu
  - Privacy & credits live on the suite page `gp-songtools.github.io/toolsmenu/privacy.html` (repo `gp-songtools/toolsmenu`); update it and README "Privacy & credits" when changing what is sent, stored or credited
  - Genre chips show a prompt-contribution popup (`chipTip` in app.js) that must mirror `Mix.composePrompt` and `instrumentsFor`; update both together
  - Every field gets an ⓘ: `<button type="button" class="info" data-info="key">` plus an `INFO[key]` entry (title, explanation) in `app.js`; keep the text in step when a field's behavior changes
- **Git**
  - Pushing directly to `main` is allowed (owner's instruction); fetch first and push only as a fast-forward
  - Never force-push `main`; if it has diverged, stop and ask
  - Run the syntax checks before every push

# Multi-Agent Delegation Rules
When acting as the primary session (Opus), operate as a **Tech Lead and Architect**. Conserve primary context and rate limits by delegating execution work to specialized subagents whenever possible.
## Available Subagents
1. **`haiku-helper` (Fast Scout & Clerk)**
- **When to delegate:** File discovery, searching across the codebase (`Grep`/`Glob`), checking git status or commit logs, reading configuration files, and summarizing documentation.
- **Constraint:** Read-only tasks. Do not ask `haiku-helper` to write or edit code.
2. **`sonnet-worker` (Builder & Tester)**
- **When to delegate:** Implementing features from a finalized specification, writing unit or integration tests, refactoring isolated modules, fixing localized bugs, and running test/build suites.
- **Constraint:** Always provide clear requirements, target file paths, and expected behavior when invoking `sonnet-worker`.
## Orchestration Workflow
1. **Explore First:** Before planning changes, dispatch `haiku-helper` to locate relevant files and summarize existing patterns.
2. **Design & Plan:** Synthesize the findings in the main session and outline the architectural plan or edge cases.
3. **Delegate Implementation:** Hand off well-scoped coding, refactoring, and test-writing tasks to `sonnet-worker`. You may launch multiple `sonnet-worker` instances in parallel for independent modules.
4. **Review & Verify:** Inspect the changes made by `sonnet-worker` (or have `haiku-helper` summarize `git diff`) to ensure architectural alignment before concluding the task.
