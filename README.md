# Randomash

A genre blender for Google's **Lyria 3** music model. Pick genres from a large list, shape them with a few controls, watch the Lyria prompt update live, and generate 30-second instrumental clips. Stems are optional. The app runs entirely in the browser, with no server and no build step, so it can be hosted on GitHub Pages.

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

**Current mix** (sticks to the top while you scroll). Your selected genres appear as chips in the order you clicked them. The first is labeled *primary* and the rest *secondary*. Each chip has **×** to remove it, and secondaries have **↑** to make them primary. A badge shows the mix's average **clash** score: *smooth* below 0.4, *interesting* from 0.4 to 0.7, *chaotic* above 0.7. With more than four genres, a warning says the prompt is likely to turn muddy. **🎲 Surprise me** picks 2–3 genres, weighted toward a clash between 0.4 and 0.7. **Clear** empties the mix.

**Genre picker.** It holds 127 genres in 13 collapsible families: Electronic; Hip-hop and R&B; Rock and metal; Jazz and blues; Folk and country; Latin and Caribbean; African; Asian; Middle Eastern and Balkan; Classical and film; Pop and dance; World fusion; Ambient and experimental. Each genre is a toggle chip. A selected chip is filled and shows its position in the mix, and each family heading shows how many of its genres are selected. The search box filters chips as you type and opens matching families. **Enter** adds the first match and **Esc** clears the search.

**Shape.**
- **Tempo** is a BPM slider. It resets to the middle of the primary genre's typical range, which is shown underneath, when the primary changes.
- **Energy** runs from low to high.
- **Mood** has 16 options.
- **Key feel** is major, minor, modal or ambiguous.
- **Arrangement** is none, build-up, drop, stripped-down or loop-friendly.
- **Seed** is a number with a 🎲 button. Tick **New random seed for each generation** to roll a fresh seed every time. Untick it, or type a seed, to lock it and regenerate the same recipe.

**Lyria prompt.** This is the composed prompt, built from:

> {Mood} {primary} track blended with {secondaries} elements, {tempo} BPM, {energy} energy, {key feel}, featuring {instruments}, {arrangement}, instrumental, 30 seconds, clean stereo mix.

The text is editable. Once you edit it, a badge changes from *live* to *edited* and live updates pause until you click **Reset to composed prompt**. Prompts are US English and never name artists.

**Generate.**
- **Stems** switches to four separate generations: drums only, bass only, chords and pads only, and melody only. They share tempo, key feel and seed. Being separate generations, they may not line up perfectly.
- **Use the gp-master stem splitter instead** (shown under Stems) generates one mix and then splits it in your browser into drums, bass and *other* (chords and melody). The split is done by [gp-master](https://github.com/gp-songtools/gp-master)'s own splitter, which downloads about 60 MB of models the first time.
- The estimated cost is shown next to the button before every call.
- While a run is in progress, a spinner and status line show which clip is being generated and any retries. **Generate** is disabled and **Cancel** appears.

**Result.** Each clip gets a player: play/pause, a waveform that fills in as it plays (click to seek), elapsed and total time, and a download link. If the model returns text with the audio, it is shown as a *Model note*.

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
| `MODEL` | `lyria-3-clip-preview` | 30-second clips. Doc pages also list `lyria-3-pro-preview` and `lyria-3.5` (full-length songs). |
| `COST_PER_CLIP_USD` | `0.04` | Estimate for the clip model; confirm on Google's pricing page. |
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
├── genres.json       127 genres in 13 families with BPM, clash, energy, acoustic, instruments
├── tools/dry-run.js  prints Surprise me prompts from the terminal, no API calls
├── .nojekyll         serve files as-is on GitHub Pages
└── README.md
```

## About the gp-master integration

gp-master runs its MDX-Net models only in the browser, through Web Workers and onnxruntime-web; it is not a Node library. Its `sep-pool.js` starts workers with `new Worker('./sep-worker.js')`, a path relative to the page. `split.html` therefore sets `<base href="../gp-master/">` and loads gp-master's own `sep-pool.js`, so gp-master's workers, runtime and models are used exactly as published. This only works when both sites share an origin, as they do on `gp-songtools.github.io`, or with the side-by-side local server above. To point at another copy, add `?gpm=/path/to/gp-master/` to the URL; it must be the same origin. Vocals are not separated, since clips are instrumental.

## Limits

- Lyria prompts are English only, and outputs carry Google's SynthID watermark.
- Seeds make a recipe repeatable only as far as the model honors them.
- Separate stem generations are independent clips and may drift in timing or key.
