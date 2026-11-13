# Randomash

A genre blender for Google's **Lyria 3** music model. Pick genres from a large list, shape them with a few controls, watch the Lyria prompt update live, and generate 30-second clips or full songs. Stems are optional, and results can be trimmed into loops. The app runs entirely in the browser, with no server and no build step, so it can be hosted on GitHub Pages.

## Setup

### On GitHub Pages

1. In the repository on GitHub, open **Settings → Pages**, set **Source** to *Deploy from a branch*, and choose `main` and `/ (root)`.
2. Open `https://gp-songtools.github.io/gp-randomash/`.
3. Click **API key & output**, paste a Gemini API key, and tick **Remember** if you want it kept in this browser.

### Locally

Any static server works. To use the gp-master stem splitter locally as well, serve a folder that holds **both** repos side by side, so the layout matches GitHub Pages:

```bash
cd ~/code            # contains gp-randomash/ and gp-master/
python3 -m http.server 8000
```

Then open `http://localhost:8000/gp-randomash/`. Opening `index.html` straight from disk does not work, because browsers block `fetch` and workers on `file://`.

### API key

- Get a key at Google AI Studio. Lyria models have no free tier, so billing must be enabled.
- The key lives only in your browser. It is held in memory, or in localStorage if **Remember** is ticked. It is sent only to `generativelanguage.googleapis.com`, in the `x-goog-api-key` header. It is never committed and never appears in a URL.
- Because the page is public, **restrict the key** in Google Cloud Console. Set the API restriction to *Generative Language API*, and the application restriction to *HTTP referrers*: `https://gp-songtools.github.io/*` and `http://localhost:8000/*`.

### Dry run (start here)

**Dry run** is on by default. It shows the exact request (endpoint, body, seed) and the cost a live run would incur, and calls nothing. Turn it off in the header when you're ready for real generations. Adding `?dry=1` to the URL forces it on.

To review the prompt variety from a terminal (Node 20+), run:

```bash
node tools/dry-run.js 5
```

## The page, described

**Header.** It has the app name, the **Dry run** switch, and **API key & output**. That button opens the settings panel: the key field with Show, Forget and Remember, the output-folder chooser, and the model ID with its estimated price per clip.

**Field help.** Every field has a small ⓘ next to its label. Hover over it, or tab to it with the keyboard, for a short explanation of what the field does and how it affects the prompt or the cost. On a phone, tap ⓘ to open the explanation and tap again, or anywhere else, to close it.

**Prepay balance.** Google offers no API to read your Gemini prepay balance, so in **API key & output** you type in the figure AI Studio shows (Billing). The app then subtracts its estimated cost for each clip Lyria returns; refused prompts and errors aren't counted. A badge in the Current mix bar, which stays pinned at the top as you scroll, shows roughly what's left (or **Set balance** until you enter one). It turns amber below about 10 clips and red at zero, and you can click it to update the figure. If a run would take the estimate below zero, Generate asks before going ahead. The figure is stored only in your browser, so visitors never see it, and it's an estimate, so re-enter the real number now and then. If the balance really is empty, Google refuses the call and the app says so instead of retrying.

**Current mix** (sticks to the top while you scroll). Your selected genres appear as chips in the order you clicked them. The first is labeled *primary* and the rest *secondary*. Each chip has **×** to remove it, and secondaries have **↑** to make them primary. A badge shows the mix's average **clash** score: *smooth* below 0.4, *interesting* from 0.4 to 0.7, *chaotic* above 0.7. With more than four genres, a warning says the prompt is likely to turn muddy. **🎲 Surprise me** picks 2–3 genres, weighted toward a clash between 0.4 and 0.7. **Clear** empties the mix.

**Genre picker.** It holds 138 genres in 14 collapsible families: Electronic; Hip-hop and R&B; Rock; Metal; Jazz and blues; Folk and country; Latin and Caribbean; African; Asian; Middle Eastern and Balkan; Classical and film; Pop and dance; World fusion; Ambient and experimental. Each genre is a toggle chip. Inside the Rock and Metal families, chips drop the redundant word ("thrash" under Metal, "math" under Rock); the current-mix bar, prompts and history always use the full name ("thrash metal"), and search finds either. Hover over a chip (or tab to it) for a popup showing exactly what it adds to the prompt: as primary, its wording, tempo and instruments; as secondary, its "blended with … elements" phrase and the instrument it brings. A selected chip is filled and shows its position in the mix, and each family heading shows how many of its genres are selected. The search box filters chips as you type and opens matching families. **Enter** adds the first match and **Esc** clears the search.

**Shape.**
- **Tempo** is a BPM slider. It resets to the middle of the primary genre's typical range, which is shown underneath, when the primary changes.
- **Energy** runs from low to high.
- **Mood** has 16 options.
- **Key** has two parts:
  - The feel: major, minor, modal or ambiguous.
  - A key menu: **Any key (Lyria chooses)**, or one of the 12 keys.
  - With **Modal**, a mode menu appears: **Any mode**, or one of the seven modes, brightest to darkest. Each has a one-word mood: Lydian (dreamy), Ionian (bright), Mixolydian (bluesy), Dorian (soulful), Aeolian (melancholic), Phrygian (tense), Locrian (unstable). The prompt then says, e.g., "in C-sharp Dorian mode", or "in the Dorian mode" with no key chosen.
  - A chosen key is spelled as musicians would for that scale and written out in words, e.g. "in D-flat major", "in C-sharp minor", "with modal harmony centered on D".
  - In stems mode every part gets the same key.
- **Arrangement** is none, build-up, drop, stripped-down or loop-friendly.
- **Seed** is a number with a 🎲 button. The seed sets the model's dice roll, not the style; the style comes from the prompt. Tick **New random seed for each generation** for a different track each time from the same recipe. Untick it, or type a seed, to lock it: the same prompt and seed should give the same track again, so you can change one setting and hear just that change. How exactly Lyria honors a seed isn't documented.

**Lyria prompt.** This is the composed prompt, built from:

> {Mood} {primary} track blended with {secondaries} elements, {tempo} BPM, {energy} energy, {key feel}, featuring {instruments}, {arrangement}, {voice}, {length}, clean stereo mix.

{voice} is "instrumental", or "with vocals" when **Vocals** is ticked. {length} is "30 seconds" for a clip, or "full-length song with a clear intro and ending" for a full song.

The text is editable. Once you edit it, a badge changes from *live* to *edited* and live updates pause until you click **Reset to composed prompt**. Prompts are US English and never name artists.

**Generate.**
- **Length**: **Clip** (30 seconds, about $0.04) or **Full song** (about 2–3 minutes, about $0.08). You pay per generation, not per second. Full songs have no exact-length setting.
- **Vocals** makes Lyria sing lyrics it writes itself (in English); the prompt says "with vocals" instead of "instrumental". Lyrics the model returns show as the *Model note*. Describe the voice generically, never as a real singer.
- **Stems** switches to four separate generations: drums only, bass only, chords and pads only, and melody only, plus a fifth, vocals only (a cappella), when Vocals is ticked. The instrument parts stay instrumental. They share tempo, key feel and seed. Being separate generations, they may not line up perfectly.
- **Use the gp-master stem splitter instead** (shown under Stems) generates one mix and then splits it in your browser into drums, bass and *other* (chords and melody). The split is done by [gp-master](https://github.com/gp-songtools/gp-master)'s own splitter, which downloads about 60 MB of models the first time.
- The estimated cost is shown next to the button before every call.
- While a run is in progress, a spinner and status line show which clip is being generated and any retries. **Generate** is disabled and **Cancel** appears.

**Result.** Each clip gets a player: play/pause, a waveform that fills in as it plays (click to seek), elapsed and total time, and a download link. If the model returns text with the audio, it is shown as a *Model note*.

**Trim.** Drag across any waveform, or click **✂ Trim**, to pick a region.
- Start and end snap to bars or beats at the run's tempo. Snapping assumes the track starts on a downbeat, so check by ear. You can also turn snapping off and type exact times.
- **Loop region** plays the selection seamlessly on repeat.
- **Save trimmed WAV** adds the cut to the same run, in history and in the output folder. It uses 3 ms fades at the edges to avoid clicks.
- Trimming happens in the browser and costs nothing, but the full clip was still billed.

**Refusals.** If the safety filter blocks a prompt, the refusal message appears in a red box under the Generate button and the page stays usable. In stems mode, the remaining parts still run.

**History** (right-hand panel on wide screens, below the main column on phones). Past runs are listed newest first, each with a ☆ star toggle, a 1–5 rating, the genres, time, mood, tempo, mode and seed. **★ only** filters the list to starred runs. Clicking a run restores its genres, controls, seed (locked) and any edited prompt, ready to tweak and regenerate. **Clips, prompt and notes** expands the run's players, its exact prompt and a notes box. **Export history.json** and **Import** move history between browsers; audio stays in the browser where it was made.

## Where files go

Every run is stored in this browser's IndexedDB: the history entry plus the audio. Clips are always available from the download links.

In **Chrome or Edge** you can also click **Choose folder…** in settings. After that, every run is written to:

```
<your folder>/
├── history.json
└── output/
    └── 20261113-143005-123_house-dub-reggae/
        ├── mix.mp3
        ├── drums.mp3 … (stems mode)
        └── split-drums.wav … (gp-master split)
```

`history.json` is rewritten after every change (new run, star, rating, note). Each run records: `id`, `timestamp`, `genres` and `genreNames` (in selection order), `sliders` (tempo, energy, mood, key, arrangement), `prompt`, `promptEdited`, `seed`, `seedSent`, `model`, `mode`, `files` (role, label, path, MIME type, size, the exact prompt for that file), `refusals`, `modelText`, `estCostUsd`, `rating`, `starred` and `notes`.

## Configuration

Everything about the API lives at the top of `lyria.js` in `LYRIA`:

| Setting | Default | Notes |
| --- | --- | --- |
| `LENGTHS.clip` | `lyria-3-clip-preview`, $0.04 | 30-second clips. |
| `LENGTHS.full` | `lyria-3.5`, then `lyria-3-pro-preview`, $0.08 | Full songs. If Google answers "model not found" (404), the next ID is tried and remembered for the session. |
| `DEFAULT_LENGTH` | `clip` | Length chosen on first visit. |
| `MAX_RETRIES` | `3` | For 408/429/5xx and network errors, with exponential backoff (1.5 s, 3 s, 6 s, or the server's `Retry-After`). |
| `SEND_SEED` | `true` | Sends `generationConfig.seed`. If the API rejects the field, the request is retried without it and the run is marked `seedSent: false`. |

Requests are strictly sequential, with one clip at a time.

## How Surprise me scores a mix

Each genre in `genres.json` has a typical BPM range, an **energy** and an **acoustic** value (0–1), and a **clash** value (0–1): how strongly it asserts its own identity in a blend. Each family lists its **near** families. The clash between two genres is:

```
distance = 0.30·family distance (same 0, near 0.5, otherwise 1)
         + 0.25·BPM-range gap (half/double time counts as close)
         + 0.20·|Δenergy| + 0.25·|Δacoustic|
clash    = clamp(1.2·distance + 0.5·mean(genre clash) − 0.22, 0, 1)
```

A mix's clash is the mean over its pairs. Surprise me picks a random primary, then adds partners weighted toward a mix clash of 0.4–0.7 (weight 1 inside that band, with a steep falloff outside it). About 60% of all genre pairs fall in that band. Around 95% of Surprise me mixes do.

## Files

```
gp-randomash/
├── index.html        page markup
├── styles.css        styles (light and dark; same palette as GP Mastering)
├── app.js            UI: picker, controls, prompt, generation, players, history
├── mix.js            genre index, clash scores, Surprise me, prompt template (browser + Node)
├── lyria.js          Lyria/Gemini client: config, retries, refusal handling, response parsing
├── store.js          IndexedDB history and audio, output folder, history.json import/export
├── split.html        bridge that runs gp-master's splitter, unmodified, from the sibling site
├── genres.json       138 genres in 14 families with BPM, clash, energy, acoustic, instruments
├── tools/dry-run.js  prints Surprise me prompts from the terminal, no API calls
├── .nojekyll         serve files as-is on GitHub Pages
└── README.md
```

## About the gp-master integration

gp-master runs its MDX-Net models only in the browser, through Web Workers and onnxruntime-web; it is not a Node library. Its `sep-pool.js` starts workers with `new Worker('./sep-worker.js')`, a path relative to the page. `split.html` therefore sets `<base href="../gp-master/">` and loads gp-master's own `sep-pool.js`, so gp-master's workers, runtime and models are used exactly as published. This only works when both sites share an origin, as they do on `gp-songtools.github.io`, or with the side-by-side local server above. To point at another copy, add `?gpm=/path/to/gp-master/` to the URL; it must be the same origin. Vocals are separated too (with gp-master's vocal model) when **Vocals** is ticked.

## Limits

- Lyria prompts are English only, and outputs carry Google's SynthID watermark.
- Seeds make a recipe repeatable only as far as the model honors them.
- Separate stem generations are independent clips and may drift in timing or key.
