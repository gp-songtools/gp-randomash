/* Randomash UI. Depends on mix.js (Mix), lyria.js (Lyria), store.js (Store). */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const UIKEY = 'randomash.ui.v1', KEYKEY = 'randomash.key.v1', BALKEY = 'randomash.balance.v1';
  const lsGet = k => { try { return localStorage.getItem(k); } catch (_) { return null; } };
  const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (_) {} };
  const qs = new URLSearchParams(location.search);

  // ---------- state ----------
  let IDX = null;
  const S = {
    genres: [], tempo: 120, energy: 50, mood: 'cinematic', key: 'minor', root: '', mode: '', arrangement: 'none',
    seed: randSeed(), seedRandom: true, stems: false, split: false, dry: true, length: Lyria.LYRIA.DEFAULT_LENGTH,
    promptEdited: false, prompt: ''
  };
  let tempoTouched = false, busy = false, abortCtl = null, currentRunId = null, apiKey = '';

  function randSeed() { return Math.floor(Math.random() * 2147483647); }
  const LEN = () => Lyria.lengthOf(S.length);
  const unitCost = () => LEN().costUsd;
  // State as the prompt template sees it: adds the length wording for the chosen option.
  const ps = () => Object.assign({}, S, { lengthText: LEN().promptLength });

  // ---------- boot ----------
  async function boot() {
    $('modelInfo').innerHTML = Object.values(Lyria.LYRIA.LENGTHS).map(L =>
      `${esc(L.label)}: <code>${esc(L.ids[0])}</code>${L.ids.length > 1 ? ` (falls back to <code>${esc(L.ids.slice(1).join(', '))}</code>)` : ''}, about $${L.costUsd.toFixed(2)} each`).join('<br>');
    let cat;
    try { cat = await (await fetch('genres.json', { cache: 'no-cache' })).json(); }
    catch (e) { setStatus('Could not load genres.json. Serve this folder over http(s); opening the file directly does not work.', 'err'); return; }
    IDX = Mix.index(cat);
    buildControls(); buildPicker(); loadUI(); loadKey(); wire();
    if (qs.get('dry') === '1') S.dry = true;
    applyStateToControls(); renderAll();
    renderBalance();
    await initFolder(); await renderHistory();
  }

  function loadUI() {
    try {
      const u = JSON.parse(lsGet(UIKEY) || 'null');
      if (!u) return;
      if (Array.isArray(u.genres)) S.genres = u.genres.filter(id => IDX.byId[id]);
      for (const k of ['tempo', 'energy', 'seed']) if (Number.isFinite(u[k])) S[k] = u[k];
      if (Mix.MOODS.includes(u.mood)) S.mood = u.mood;
      if (Mix.KEY_FEELS[u.key]) S.key = u.key;
      if (Mix.KEY_ROOTS.some(r => r.id === u.root)) S.root = u.root;
      if (Mix.MODES.some(m => m.id === u.mode)) S.mode = u.mode;
      if (u.arrangement in Mix.ARRANGEMENTS) S.arrangement = u.arrangement;
      if (Lyria.LYRIA.LENGTHS[u.length]) S.length = u.length;
      for (const k of ['seedRandom', 'stems', 'split', 'dry', 'promptEdited']) if (typeof u[k] === 'boolean') S[k] = u[k];
      if (typeof u.prompt === 'string') S.prompt = u.prompt;
      tempoTouched = !!u.tempoTouched;
    } catch (_) {}
  }
  function saveUI() {
    lsSet(UIKEY, JSON.stringify(Object.assign({}, S, { tempoTouched })));
  }

  function loadKey() {
    const k = lsGet(KEYKEY);
    if (k) { apiKey = k; $('key').value = k; $('keyRemember').checked = true; }
  }

  // ---------- prepay balance (estimate) ----------
  /* { amount: what AI Studio showed, spent: estimated cost of clips since then, setAt } in
     localStorage. Kept separately from history so deleting runs never "refunds" money. */
  function balGet() {
    try { const b = JSON.parse(lsGet(BALKEY) || 'null'); return b && Number.isFinite(b.amount) && Number.isFinite(b.spent) ? b : null; }
    catch (_) { return null; }
  }
  const balLeft = () => { const b = balGet(); return b ? Math.round((b.amount - b.spent) * 100) / 100 : null; };
  function balSpend(usd) { const b = balGet(); if (!b) return; b.spent = Math.round((b.spent + usd) * 10000) / 10000; lsSet(BALKEY, JSON.stringify(b)); renderBalance(); }
  const money = v => (v < 0 ? '−$' : '$') + Math.abs(v).toFixed(2);

  function renderBalance() {
    const b = balGet(), left = balLeft(), badge = $('balBadge'), unit = unitCost();
    $('balClear').hidden = !b;
    if (!b) {
      badge.textContent = 'Set balance';
      badge.className = 'bal unset';
      badge.setAttribute('aria-label', 'No prepay balance set. Click to enter the balance from AI Studio.');
      $('balState').textContent = 'Enter the balance AI Studio shows. The app subtracts its estimated cost for each clip and shows what’s left next to Current mix. Only this browser stores it.';
      renderCost(); return;
    }
    const clips = Math.max(0, Math.floor(left / unit + 1e-9));
    badge.hidden = false;
    badge.textContent = left > 0 ? `≈ ${money(left)} left` : `≈ ${money(left)} · top up`;
    badge.className = 'bal' + (left <= 0 ? ' out' : left < unit * 10 ? ' low' : '');
    const what = S.length === 'full' ? 'song' : 'clip';
    badge.setAttribute('aria-label', `Estimated prepay balance ${money(left)}, about ${clips} ${what}s. Click to update.`);
    const when = new Date(b.setAt);
    $('balState').textContent = `Set to ${money(b.amount)} on ${when.toLocaleDateString()} ${when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. `
      + `Since then about ${money(b.spent)} spent, so roughly ${money(left)} (${clips} ${what}${clips === 1 ? '' : 's'} at the current length) left. `
      + 'This is an estimate: re-enter the figure from AI Studio now and then.';
    renderCost();
  }

  // ---------- controls ----------
  function buildControls() {
    $('mood').innerHTML = Mix.MOODS.map(m => `<option value="${m}">${m[0].toUpperCase() + m.slice(1)}</option>`).join('');
    const kf = { major: 'Major', minor: 'Minor', modal: 'Modal', ambiguous: 'Ambiguous' };
    $('keyFeel').innerHTML = Object.keys(kf).map(k => `<label><input type="radio" name="keyFeel" value="${k}"><span>${kf[k]}</span></label>`).join('');
    $('root').innerHTML = '<option value="">Any key (Lyria chooses)</option>' + Mix.KEY_ROOTS.map(r => `<option value="${r.id}">${r.ui}</option>`).join('');
    $('mode').innerHTML = '<option value="">Any mode (Lyria chooses)</option>' + Mix.MODES.map(m => `<option value="${m.id}">${m.name} · ${m.mood}</option>`).join('');
    $('lengthSeg').innerHTML = Object.entries(Lyria.LYRIA.LENGTHS).map(([k, L]) =>
      `<label><input type="radio" name="length" value="${k}"><span>${esc(L.label)} · ${esc(L.detail)} · $${L.costUsd.toFixed(2)}</span></label>`).join('');
    const ar = { none: 'None', buildup: 'Build-up', drop: 'Drop', stripped: 'Stripped-down', loop: 'Loop-friendly' };
    $('arr').innerHTML = Object.keys(ar).map(k => `<option value="${k}">${ar[k]}</option>`).join('');
  }

  function buildPicker() {
    $('families').innerHTML = IDX.families.map(f => `
      <details class="fam" open data-fam="${f.id}">
        <summary>${esc(f.name)} <span class="n">${f.genres.length}</span><span class="sel" hidden></span></summary>
        <div class="chips">${f.genres.map(g => `<button type="button" class="chip" data-id="${g.id}" aria-pressed="false" aria-label="${esc(g.name)}" title="${esc(g.name)} · typical ${g.bpm[0]}–${g.bpm[1]} BPM">${esc(g.label || g.name)}</button>`).join('')}</div>
      </details>`).join('');
  }

  function applyStateToControls() {
    $('tempo').value = S.tempo; $('energy').value = S.energy; $('mood').value = S.mood; $('arr').value = S.arrangement; $('root').value = S.root; $('mode').value = S.mode;
    const r = document.querySelector(`#keyFeel input[value="${S.key}"]`); if (r) r.checked = true;
    const l = document.querySelector(`#lengthSeg input[value="${S.length}"]`); if (l) l.checked = true;
    $('seed').value = S.seed; $('seedRandom').checked = S.seedRandom;
    $('stems').checked = S.stems; $('split').checked = S.split; $('dry').checked = S.dry;
    if (S.promptEdited) $('prompt').value = S.prompt;
  }

  // ---------- selection ----------
  function toggleGenre(id) {
    const i = S.genres.indexOf(id);
    const oldPrimary = S.genres[0];
    if (i >= 0) S.genres.splice(i, 1); else S.genres.push(id);
    if (S.genres[0] !== oldPrimary) primaryChanged();
    renderAll();
  }
  function makePrimary(id) {
    S.genres = [id].concat(S.genres.filter(x => x !== id));
    primaryChanged(); renderAll();
  }
  function setGenres(ids) { S.genres = ids.slice(); primaryChanged(); renderAll(); }
  function primaryChanged() {
    const p = IDX.byId[S.genres[0]];
    if (p) { S.tempo = Mix.defaultTempo(p); tempoTouched = false; $('tempo').value = S.tempo; }
  }

  // ---------- render ----------
  function renderAll() { renderChips(); renderMix(); renderControls(); renderPrompt(); renderCost(); saveUI(); }

  function renderChips() {
    const pos = {}; S.genres.forEach((id, i) => pos[id] = i + 1);
    document.querySelectorAll('.chip').forEach(b => {
      const on = !!pos[b.dataset.id];
      b.setAttribute('aria-pressed', on);
      // Short label inside its family (e.g. "thrash" under Metal); the mix bar and prompt use the full name.
      const g = IDX.byId[b.dataset.id], name = g.label || g.name;
      b.innerHTML = on ? `${esc(name)}<span class="ord" aria-label="position ${pos[b.dataset.id]}">${pos[b.dataset.id]}</span>` : esc(name);
    });
    document.querySelectorAll('details.fam').forEach(d => {
      const n = d.querySelectorAll('.chip[aria-pressed="true"]').length, s = d.querySelector('.sel');
      s.hidden = !n; s.textContent = n + ' selected';
    });
  }

  function renderMix() {
    const gs = S.genres.map(id => IDX.byId[id]);
    $('mixChips').innerHTML = gs.length ? gs.map((g, i) => `
      <span class="mchip${i ? '' : ' primary'}">
        <span class="role">${i ? 'secondary' : 'primary'}</span>${esc(g.name)}
        ${i ? `<button type="button" data-primary="${g.id}" title="Make primary" aria-label="Make ${esc(g.name)} primary">↑</button>` : ''}
        <button type="button" data-remove="${g.id}" title="Remove" aria-label="Remove ${esc(g.name)}">×</button>
      </span>`).join('') : '<span class="empty">Click genres below, or press Surprise me. The first one you pick leads the mix.</span>';
    $('tooMany').hidden = gs.length <= 4;
    const c = $('clash');
    if (gs.length > 1) {
      const v = Mix.mixClash(gs);
      c.hidden = false;
      c.className = 'clash ' + (v < 0.4 ? 'lo' : v <= 0.7 ? 'mid' : 'hi');
      c.textContent = 'clash ' + v.toFixed(2) + ' · ' + (v < 0.4 ? 'smooth' : v <= 0.7 ? 'interesting' : 'chaotic');
      c.title = 'Average pair clash, 0–1. Surprise me aims for 0.4–0.7.';
    } else c.hidden = true;
  }

  function renderControls() {
    $('tempoV').textContent = S.tempo; $('energyV').textContent = Mix.energyWord(S.energy);
    const p = IDX.byId[S.genres[0]];
    $('tempoHint').textContent = p ? `Typical for ${p.name}: ${p.bpm[0]}–${p.bpm[1]} BPM` : 'Pick a genre to set a typical tempo.';
    $('tempoReset').hidden = !p || S.tempo === Mix.defaultTempo(p);
    $('seed').disabled = false;
    $('split').disabled = !S.stems;
    $('splitRow').style.opacity = S.stems ? 1 : .55;
    document.body.classList.toggle('dry', S.dry);
    $('modeRow').hidden = S.key !== 'modal';
    $('lengthNote').textContent = S.length === 'full'
      ? 'Full songs cost twice as much and take longer to generate. There is no exact-length setting; the model decides, typically 2–3 minutes.'
      : 'Clips are always 30 seconds. Use Trim on a result to cut a shorter loop (the full clip is still billed).';
  }

  function composed() { return Mix.composePrompt(IDX, ps()); }

  function renderPrompt() {
    if (!S.promptEdited) { S.prompt = composed(); $('prompt').value = S.prompt; }
    const st = $('promptState');
    st.textContent = S.promptEdited ? 'edited' : 'live';
    st.classList.toggle('edited', S.promptEdited);
    $('promptReset').hidden = !S.promptEdited;
  }

  function plannedCalls() {
    if (!S.stems || S.split) return 1;
    return Mix.STEM_ROLES.length;
  }
  function renderCost() {
    const n = plannedCalls(), usd = n * unitCost(), what = S.length === 'full' ? 'song' : 'clip';
    $('cost').textContent = S.dry
      ? `Dry run: no API call. A live run would be ${n} ${what}${n > 1 ? 's' : ''}, about $${usd.toFixed(2)}.`
      : `Estimated cost: about $${usd.toFixed(2)} (${n} ${what}${n > 1 ? 's' : ''} × $${unitCost().toFixed(2)})`
        + (balLeft() != null ? ` · leaves about ${money(balLeft() - usd)}` : '');
    $('gen').disabled = busy || !$('prompt').value.trim();
  }

  function setStatus(text, kind) {
    const el = $('status');
    el.innerHTML = (kind === 'busy' ? '<span class="spin" aria-hidden="true"></span>' : '') + `<span>${esc(text || '')}</span>`;
    el.style.color = kind === 'err' ? 'var(--warn)' : '';
  }
  function showRefusal(title, msg) {
    const r = $('refusal');
    if (!title) { r.hidden = true; r.innerHTML = ''; return; }
    r.hidden = false; r.innerHTML = `<b>${esc(title)}</b>${esc(msg || '')}`;
  }

  // ---------- search ----------
  let foldMemo = null;
  function filter(q) {
    q = q.trim().toLowerCase();
    let any = false;
    if (q && !foldMemo) foldMemo = [...document.querySelectorAll('details.fam')].map(d => d.open);
    document.querySelectorAll('details.fam').forEach((d, i) => {
      const fam = IDX.families[i], famHit = q && fam.name.toLowerCase().includes(q);
      let hits = 0;
      d.querySelectorAll('.chip').forEach(b => {
        const g = IDX.byId[b.dataset.id];
        const hit = !q || famHit || g.name.toLowerCase().includes(q) || (g.label || '').toLowerCase().includes(q) || g.id.includes(q.replace(/\s+/g, '-'));
        b.classList.toggle('hidden', !hit); if (hit) hits++;
      });
      d.classList.toggle('hidden', !hits);
      if (q && hits) d.open = true;
      if (hits) any = true;
    });
    if (!q && foldMemo) { document.querySelectorAll('details.fam').forEach((d, i) => d.open = foldMemo[i]); foldMemo = null; }
    $('noMatch').hidden = any;
  }

  // ---------- wiring ----------
  function wire() {
    $('families').addEventListener('click', e => { const b = e.target.closest('.chip'); if (b) toggleGenre(b.dataset.id); });
    $('mixChips').addEventListener('click', e => {
      const r = e.target.closest('[data-remove]'), p = e.target.closest('[data-primary]');
      if (r) toggleGenre(r.dataset.remove); else if (p) makePrimary(p.dataset.primary);
    });
    $('surprise').onclick = () => setGenres(Mix.surprise(IDX));
    $('clear').onclick = () => { S.genres = []; renderAll(); };
    $('search').addEventListener('input', e => filter(e.target.value));
    $('search').addEventListener('keydown', e => {
      if (e.key === 'Enter') { const b = document.querySelector('.chip:not(.hidden)'); if (b && $('search').value.trim()) { toggleGenre(b.dataset.id); $('search').select(); } e.preventDefault(); }
      if (e.key === 'Escape') { $('search').value = ''; filter(''); }
    });
    $('foldAll').onclick = () => {
      const ds = [...document.querySelectorAll('details.fam')], open = ds.some(d => d.open);
      ds.forEach(d => d.open = !open); $('foldAll').textContent = open ? 'Expand all' : 'Collapse all';
    };

    $('tempo').oninput = e => { S.tempo = +e.target.value; tempoTouched = true; renderAll(); };
    $('tempoReset').onclick = () => primaryChanged() || renderAll();
    $('energy').oninput = e => { S.energy = +e.target.value; renderAll(); };
    $('mood').onchange = e => { S.mood = e.target.value; renderAll(); };
    $('keyFeel').onchange = e => { S.key = e.target.value; renderAll(); };
    $('root').onchange = e => { S.root = e.target.value; renderAll(); };
    $('mode').onchange = e => { S.mode = e.target.value; renderAll(); };
    $('arr').onchange = e => { S.arrangement = e.target.value; renderAll(); };
    $('lengthSeg').onchange = e => {
      const from = LEN().promptLength;
      S.length = e.target.value;
      // Keep an edited prompt's length wording in step with the choice.
      if (S.promptEdited && S.prompt.includes(from)) { S.prompt = S.prompt.replace(from, LEN().promptLength); $('prompt').value = S.prompt; }
      renderAll(); renderBalance();
    };
    $('seed').onchange = e => { const v = Math.max(0, Math.min(2147483647, Math.floor(+e.target.value || 0))); S.seed = v; e.target.value = v; S.seedRandom = false; $('seedRandom').checked = false; saveUI(); };
    $('seedRoll').onclick = () => { S.seed = randSeed(); $('seed').value = S.seed; saveUI(); };
    $('seedRandom').onchange = e => { S.seedRandom = e.target.checked; saveUI(); };
    $('stems').onchange = e => { S.stems = e.target.checked; renderAll(); };
    $('split').onchange = e => { S.split = e.target.checked; renderAll(); if (S.split) pingSplitter(); };
    $('dry').onchange = e => { S.dry = e.target.checked; renderAll(); };

    $('prompt').addEventListener('input', e => {
      S.prompt = e.target.value; S.promptEdited = e.target.value !== composed();
      renderPrompt(); renderCost(); saveUI();
    });
    $('promptReset').onclick = () => { S.promptEdited = false; renderAll(); };

    $('gen').onclick = generate;
    $('cancel').onclick = () => { if (abortCtl) abortCtl.abort(); splitCancel(); };

    // settings panel
    $('setBtn').onclick = () => { const p = $('setPanel'); p.hidden = !p.hidden; $('setBtn').setAttribute('aria-expanded', !p.hidden); };
    $('key').addEventListener('input', e => { apiKey = e.target.value.trim(); if ($('keyRemember').checked) lsSet(KEYKEY, apiKey || null); });
    $('keyRemember').onchange = e => lsSet(KEYKEY, e.target.checked && apiKey ? apiKey : null);
    $('keyShow').onclick = () => { const k = $('key'); k.type = k.type === 'password' ? 'text' : 'password'; $('keyShow').textContent = k.type === 'password' ? 'Show' : 'Hide'; };
    $('keyForget').onclick = () => { apiKey = ''; $('key').value = ''; $('keyRemember').checked = false; lsSet(KEYKEY, null); setStatus('Key removed from this page and from this browser’s storage.'); };
    const balSet = () => {
      const v = Math.round(parseFloat($('balIn').value) * 100) / 100;
      if (!Number.isFinite(v) || v < 0) { setStatus('Enter the balance as a number, for example 4.12.', 'err'); $('balIn').focus(); return; }
      lsSet(BALKEY, JSON.stringify({ amount: v, spent: 0, setAt: new Date().toISOString() }));
      $('balIn').value = ''; renderBalance(); setStatus(`Balance set to ${money(v)}.`);
    };
    $('balSet').onclick = balSet;
    $('balIn').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); balSet(); } });
    $('balClear').onclick = () => { lsSet(BALKEY, null); renderBalance(); };
    // The badge lives in the sticky mix bar, so the settings panel may be scrolled out of view.
    $('balBadge').onclick = () => {
      $('setPanel').hidden = false; $('setBtn').setAttribute('aria-expanded', true);
      $('setPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
      $('balIn').focus({ preventScroll: true });
    };
    $('folderPick').onclick = async () => {
      try { await Store.chooseFolder(); await renderFolder(); setStatus('Output folder set. history.json written there.'); }
      catch (e) { if (e.name !== 'AbortError') setStatus('Could not use that folder: ' + e.message, 'err'); }
    };
    $('folderForget').onclick = async () => { await Store.forgetFolder(); await renderFolder(); };

    // history
    $('starOnly').onchange = renderHistory;
    $('histExport').onclick = async () => downloadBlob(new Blob([await Store.exportJSON()], { type: 'application/json' }), 'history.json');
    $('histImport').onchange = async e => {
      const f = e.target.files[0]; e.target.value = '';
      if (!f) return;
      try { const n = await Store.importJSON(await f.text()); setStatus(`Imported ${n} run${n === 1 ? '' : 's'}. Audio is not part of history.json, so imported runs from another browser have settings but no clips.`); renderHistory(); }
      catch (err) { setStatus('Import failed: ' + err.message, 'err'); }
    };
    $('history').addEventListener('click', onHistoryClick);
    $('history').addEventListener('change', onHistoryChange);
    $('history').addEventListener('toggle', onHistoryToggle, true);
  }

  // ---------- output folder ----------
  async function initFolder() {
    if (!Store.folderSupported()) {
      $('folderPick').disabled = true;
      $('folderNote').textContent = 'This browser cannot write to a folder (that needs Chrome or Edge on a computer). Use the download links and Export history.json instead.';
      return;
    }
    await Store.loadFolder(); await renderFolder();
  }
  async function renderFolder() {
    const name = Store.folderName();
    $('folderForget').hidden = !name;
    if (!name) { $('folderState').textContent = 'Clips are kept in this browser and offered as downloads.'; return; }
    const ok = await Store.folderReady(false);
    $('folderState').innerHTML = `Saving to folder <b>${esc(name)}</b>` + (ok ? '.' : ' (permission needed: it will be asked on the next Generate).');
  }

  // ---------- generation ----------
  function runSlug() { return Mix.slug(S.genres.map(id => IDX.byId[id].name).join(' ')); }
  // Local time to the millisecond, so quick regenerations of the same mix never share a folder.
  function stamp(d) { const p = (n, w) => String(n).padStart(w || 2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${p(d.getMilliseconds(), 3)}`; }

  function buildCalls(prompt) {
    if (!S.stems || S.split) return [{ role: 'mix', label: 'Full mix', prompt }];
    return Mix.STEM_ROLES.map(r => ({
      role: r.id, label: r.label,
      prompt: S.promptEdited ? Mix.rolePromptFrom(prompt, r) : Mix.composePrompt(IDX, ps(), r)
    }));
  }

  function setBusy(on) {
    busy = on;
    $('gen').disabled = on || !$('prompt').value.trim();
    $('cancel').hidden = !on;
    $('surprise').disabled = on;
  }

  async function generate() {
    if (busy) return;
    const prompt = $('prompt').value.trim();
    if (!prompt) return;
    showRefusal(null);
    if (S.seedRandom) { S.seed = randSeed(); $('seed').value = S.seed; }
    const calls = buildCalls(prompt);
    const mode = !S.stems ? 'mix' : S.split ? 'mix+split' : 'stems';
    const unit = unitCost(), cost = calls.length * unit, length = S.length;

    if (S.dry) return dryRun(calls, mode, cost);
    if (!apiKey) { setStatus('Add your Gemini API key under “API key & output” first. Or turn on Dry run to preview requests.', 'err'); $('setPanel').hidden = false; $('key').focus(); return; }
    const left = balLeft();
    if (left != null && left - cost < 0 &&
        !confirm(`This run costs about ${money(cost)}, but your estimated prepay balance is ${money(left)}.\n\nIf the balance has really run out, Google will refuse the request. Generate anyway?`)) {
      setStatus('Not generated. Update the balance under “API key & output” if AI Studio shows more.'); return;
    }
    if (Store.folderName()) { try { await Store.folderReady(true); } catch (_) {} }

    const now = new Date(), id = stamp(now) + '_' + runSlug();
    const run = {
      id, timestamp: now.toISOString(),
      genres: S.genres.slice(), genreNames: S.genres.map(g => IDX.byId[g].name),
      sliders: { tempo: S.tempo, energy: S.energy, mood: S.mood, key: S.key, root: S.root, mode: S.key === 'modal' ? S.mode : '', arrangement: S.arrangement },
      prompt, promptEdited: S.promptEdited, seed: S.seed, seedSent: true, model: Lyria.modelFor(length), length, mode,
      files: [], refusals: [], modelText: '', estCostUsd: +cost.toFixed(2), spentUsd: 0, rating: 0, starred: false, notes: ''
    };
    currentRunId = id;
    setBusy(true); abortCtl = new AbortController();
    const out = startResult(run, false);
    try {
      for (let i = 0; i < calls.length; i++) {
        const c = calls[i];
        setStatus(`Generating ${c.label.toLowerCase()} (${i + 1} of ${calls.length}) · est. $${unit.toFixed(2)} for this ${length === 'full' ? 'song' : 'clip'}${length === 'full' ? ' (full songs can take a minute or more)' : ''}…`, 'busy');
        try {
          const r = await Lyria.generate({ key: apiKey, prompt: c.prompt, seed: S.seed, length, signal: abortCtl.signal, onStatus: t => setStatus(t, 'busy') });
          // A returned clip is billed; refusals and errors are assumed not to be.
          run.spentUsd = Math.round((run.spentUsd + unit) * 10000) / 10000;
          run.model = r.model;
          balSpend(unit);
          if (!r.seedSent) run.seedSent = false;
          if (r.text && !run.modelText.split('\n').includes(r.text)) run.modelText = (run.modelText ? run.modelText + '\n' : '') + r.text;
          await addFile(run, c, new Blob([r.bytes], { type: r.mime }), r.mime, out);
        } catch (e) {
          if (e.refused) {
            run.refusals.push({ role: c.role, reason: e.reason || '', message: e.message });
            showRefusal(`${c.label}: refused`, e.message + (calls.length > 1 && i < calls.length - 1 ? '\nContinuing with the remaining parts.' : '\nThe page is still usable: edit the prompt and try again.'));
            if (calls.length === 1) break;
            continue;
          }
          throw e;
        }
      }
      if (mode === 'mix+split' && run.files.length) await splitRun(run, out);
      if (run.files.length) {
        await Store.putRun(run);
        setStatus(`Done: ${run.files.length} file${run.files.length > 1 ? 's' : ''} saved${Store.folderName() ? ' to ' + Store.folderName() + '/output/' + id : ' in this browser'}.` + (run.seedSent ? '' : ' Note: the model did not accept a seed, so this run cannot be reproduced exactly.'));
      } else {
        out.card.hidden = true;
        setStatus(run.refusals.length ? 'Nothing generated.' : '', run.refusals.length ? 'err' : '');
      }
      if (run.modelText) out.meta.insertAdjacentHTML('beforeend', `<p class="modeltext">Model note: ${esc(run.modelText.slice(0, 600))}</p>`);
    } catch (e) {
      setStatus(e.message || String(e), 'err');
      if (run.files.length) { await Store.putRun(run); }
    } finally {
      setBusy(false); abortCtl = null; renderCost(); saveUI(); renderHistory();
    }
  }

  async function addFile(run, call, blob, mime, out) {
    const ext = Lyria.extFor(mime), name = call.role + '.' + ext, path = 'output/' + run.id + '/' + name;
    await Store.putAudio(run.id, call.role, blob);
    let saved = false;
    try { saved = await Store.writeRunFile(path, blob); } catch (e) { console.warn(e); }
    const f = { role: call.role, label: call.label, path, file: run.id + '_' + name, mime, bytes: blob.size, savedToFolder: saved, prompt: call.prompt };
    run.files.push(f);
    const p = player(blob, f, run);
    if (out.after) out.after.after(p); else out.clips.appendChild(p);
  }

  function dryRun(calls, mode, cost) {
    const card = $('resultCard');
    card.hidden = false;
    $('resultTitle').textContent = 'Dry run: nothing was sent';
    $('resultMeta').textContent = `${calls.length} request${calls.length > 1 ? 's' : ''} · about $${cost.toFixed(2)} if live`;
    const url = Lyria.LYRIA.API + 'models/' + Lyria.modelFor(S.length) + ':generateContent';
    $('result').innerHTML = calls.map(c => `
      <div><b>${esc(c.label)}</b>
      <pre class="reqbox">POST ${esc(url)}\nx-goog-api-key: ••••\n\n${esc(JSON.stringify(Lyria.requestBody(c.prompt, S.seed, Lyria.LYRIA.SEND_SEED), null, 2))}</pre></div>`).join('')
      + (mode === 'mix+split' ? '<p class="hint">Then the mix would be split into drums, bass and other by gp-master in this browser.</p>' : '');
    setStatus('Dry run: request shown below. Turn off Dry run to call Lyria.');
    console.info('[Randomash dry run]', calls);
  }

  function startResult(run, fromHistory) {
    const card = $('resultCard');
    card.hidden = false;
    $('resultTitle').textContent = run.genreNames.join(' + ') || 'Result';
    $('resultMeta').textContent = `seed ${run.seed} · ${run.model}`;
    $('result').innerHTML = `<div class="meta"></div><div class="clips"></div>`;
    return { card, clips: $('result').querySelector('.clips'), meta: $('result').querySelector('.meta') };
  }

  // ---------- gp-master split ----------
  let splitId = 0, splitWait = null;
  function splitFrame() {
    const f = $('splitFrame');
    if (!f.src) f.src = 'split.html' + (qs.get('gpm') ? '?gpm=' + encodeURIComponent(qs.get('gpm')) : '');
    return new Promise(res => { if (f.dataset.loaded) res(f); else f.addEventListener('load', () => { f.dataset.loaded = 1; res(f); }, { once: true }); });
  }
  function splitCall(msg, transfer, onStatus) {
    return splitFrame().then(f => new Promise((res, rej) => {
      const id = ++splitId;
      const h = e => {
        if (e.origin !== location.origin || e.source !== f.contentWindow) return;
        const m = e.data || {};
        if (msg.type === 'ping' && m.type === 'pong') { removeEventListener('message', h); res(m); return; }
        if (m.id !== id) return;
        if (m.type === 'status' && onStatus) onStatus(m.text);
        else if (m.type === 'progress' && onStatus) onStatus(`Splitting ${m.stem}: ${m.done} of ${m.total} chunks…`);
        else if (m.type === 'done') { removeEventListener('message', h); splitWait = null; res(m); }
        else if (m.type === 'error') { removeEventListener('message', h); splitWait = null; rej(new Error(m.message)); }
      };
      addEventListener('message', h);
      splitWait = { rej, h };
      f.contentWindow.postMessage(Object.assign({ id }, msg), location.origin, transfer || []);
    }));
  }
  function splitCancel() {
    if (!splitWait) return;
    $('splitFrame').contentWindow.postMessage({ type: 'cancel' }, location.origin);
  }
  async function pingSplitter() {
    try {
      const p = await splitCall({ type: 'ping' });
      if (!p.ok) setStatus('gp-master splitter not available: ' + p.message, 'err');
      else setStatus('gp-master splitter found at ' + p.base);
    } catch (e) { setStatus('gp-master splitter not available: ' + e.message, 'err'); }
  }

  async function splitRun(run, out) {
    const mixFile = run.files.find(f => f.role === 'mix');
    if (!mixFile) return;
    const p = await splitCall({ type: 'ping' });
    if (!p.ok) { setStatus('Mix saved, but the gp-master splitter is not available: ' + p.message, 'err'); return; }
    setStatus('Decoding the mix for splitting…', 'busy');
    const blob = await Store.getAudio(run.id, 'mix');
    const SR = 44100;  // the MDX-Net models expect 44.1 kHz
    const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SR });
    let buf;
    try { buf = await ctx.decodeAudioData(await blob.arrayBuffer()); } finally { ctx.close(); }
    const L = buf.getChannelData(0).slice(), R = (buf.numberOfChannels > 1 ? buf.getChannelData(1) : buf.getChannelData(0)).slice();
    const r = await splitCall({ type: 'split', mix: [L, R], sampleRate: SR, stems: ['drums', 'bass', 'other'] }, [L.buffer, R.buffer], t => setStatus('gp-master: ' + t, 'busy'));
    const labels = { drums: 'Drums (gp-master split)', bass: 'Bass (gp-master split)', other: 'Other: chords and melody (gp-master split)' };
    for (const k of ['drums', 'bass', 'other']) {
      if (!r.result[k]) continue;
      const wav = encodeWav(r.result[k], r.sampleRate || SR);
      await addFile(run, { role: 'split-' + k, label: labels[k], prompt: '' }, wav, 'audio/wav', out);
    }
  }

  function encodeWav(ch, sr) {
    const n = ch[0].length, nc = ch.length, buf = new ArrayBuffer(44 + n * nc * 2), v = new DataView(buf);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n * nc * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nc, true); v.setUint32(24, sr, true);
    v.setUint32(28, sr * nc * 2, true); v.setUint16(32, nc * 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * nc * 2, true);
    let o = 44;
    for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) { const x = Math.max(-1, Math.min(1, ch[c][i])); v.setInt16(o, x < 0 ? x * 32768 : x * 32767, true); o += 2; }
    return new Blob([buf], { type: 'audio/wav' });
  }

  // ---------- player with waveform and trim ----------
  /* Click the waveform to seek; drag across it to select a region. The Trim panel snaps the region
     to beats or bars at the run's tempo (assuming the track starts on a downbeat), loops it
     seamlessly through Web Audio, and saves it as a WAV added to the run. */
  let actx = null, playing = null, looping = null;
  const ac = () => (actx = actx || new (window.AudioContext || window.webkitAudioContext)());
  function stopLoop() { if (looping) { try { looping.src.stop(); } catch (_) {} looping.done(); looping = null; } }

  function player(blob, f, run) {
    const url = URL.createObjectURL(blob);
    const bpm = run && run.sliders && run.sliders.tempo;
    const el = document.createElement('div');
    el.className = 'player';
    el.innerHTML = `
      <div class="ttl">${esc(f.label)} <small>${esc(f.role)} · ${(f.bytes / 1024 / 1024).toFixed(2)} MB${f.savedToFolder ? ' · saved to folder' : ''}</small></div>
      <button type="button" class="pp" aria-label="Play ${esc(f.label)}">▶</button>
      <canvas aria-label="Waveform. Click to seek, drag to select a region to trim."></canvas>
      <span class="tm">0:00 / –:––</span>
      <div class="dl"><a href="${url}" download="${esc(f.file)}">Download ${esc(f.file)}</a>
        <button type="button" class="link" data-trim aria-expanded="false">✂ Trim</button><button type="button" class="info" data-info="trim"></button>
        ${f.prompt ? '<span class="hint" style="margin:0" title="' + esc(f.prompt) + '">prompt ▸ hover</span>' : ''}</div>
      <div class="trim" hidden>
        <div class="row">
          <label>Start <input type="number" data-a min="0" step="0.01"> s</label>
          <label>End <input type="number" data-b min="0" step="0.01"> s</label>
          <label>Snap <select data-snap>
            <option value="bar"${bpm ? ' selected' : ''}>to bars</option><option value="beat">to beats</option><option value="off"${bpm ? '' : ' selected'}>off</option>
          </select></label>
        </div>
        <div class="row">
          <span class="len" data-len></span><span class="spacer"></span>
          <button type="button" class="ghost small" data-loop>▶ Loop region</button>
          <button type="button" class="small" data-save>Save trimmed WAV</button>
        </div>
        <p class="hint">Drag across the waveform to pick a region.${bpm ? ` Beats and bars use ${bpm} BPM and assume the track starts on a downbeat, so check by ear.` : ''} Trimming happens in your browser and costs nothing.</p>
      </div>`;
    const audio = new Audio(url); audio.preload = 'metadata';
    const q = s => el.querySelector(s);
    const btn = q('.pp'), cv = q('canvas'), tm = q('.tm'), panel = q('.trim'), inA = q('[data-a]'), inB = q('[data-b]'), snapSel = q('[data-snap]');
    let peaks = null, decoded = null, sel = null;
    const dur = () => decoded ? decoded.duration : (isFinite(audio.duration) ? audio.duration : 0);
    const fmt = s => isFinite(s) ? Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0') : '–:––';
    const unit = () => { const m = snapSel.value; return !bpm || m === 'off' ? 0 : (60 / bpm) * (m === 'bar' ? 4 : 1); };
    const snap = t => { const u = unit(); return u ? Math.round(t / u) * u : t; };
    function setSel(a, b, doSnap) {
      const D = dur(); if (!D) return;
      if (b < a) [a, b] = [b, a];
      if (doSnap !== false) { a = snap(a); b = snap(b); }
      const u = unit() || 0.05;
      a = Math.max(0, Math.min(a, D)); b = Math.max(0, Math.min(b, D));
      if (b - a < u - 1e-6) b = Math.min(D, a + u);
      if (b - a < 0.05) return;
      sel = [a, b];
      inA.value = a.toFixed(2); inB.value = b.toFixed(2);
      const secs = b - a, u2 = bpm ? 60 / bpm : 0;
      q('[data-len]').textContent = `${secs.toFixed(2)} s` + (u2 ? ` · ${+(secs / u2 / 4).toFixed(2)} bars (${+(secs / u2).toFixed(1)} beats)` : '');
      if (looping && looping.owner === el) startLoop();
      draw();
    }
    function openTrim(open) {
      panel.hidden = !open; q('[data-trim]').setAttribute('aria-expanded', open);
      if (open && !sel) { const u = unit() ? (60 / bpm) * 4 : 0; setSel(0, u ? u * 4 : Math.min(8, dur())); }
      if (!open && looping && looping.owner === el) stopLoop();
      draw();
    }

    function draw() {
      const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
      if (!w) return;
      if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      const g = cv.getContext('2d'), cs = getComputedStyle(document.documentElement), D = dur();
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
      if (sel && D && !panel.hidden) {
        g.fillStyle = cs.getPropertyValue('--soft');
        g.fillRect(sel[0] / D * w, 0, (sel[1] - sel[0]) / D * w, h);
      }
      const prog = audio.duration ? audio.currentTime / audio.duration : 0;
      const bars = Math.max(20, Math.floor(w / 3));
      for (let i = 0; i < bars; i++) {
        const a = peaks ? peaks[Math.floor(i / bars * peaks.length)] : 0.08;
        const bh = Math.max(2, a * (h - 4));
        g.fillStyle = (i / bars) < prog ? cs.getPropertyValue('--waveOn') : cs.getPropertyValue('--wave');
        g.fillRect(i * 3, (h - bh) / 2, 2, bh);
      }
      if (sel && D && !panel.hidden) {
        g.fillStyle = cs.getPropertyValue('--ac');
        for (const t of sel) g.fillRect(Math.min(w - 2, t / D * w), 0, 2, h);
      }
    }
    const tick = () => { draw(); tm.textContent = fmt(audio.currentTime) + ' / ' + fmt(audio.duration); if (!audio.paused) requestAnimationFrame(tick); };
    audio.addEventListener('loadedmetadata', tick);
    audio.addEventListener('ended', () => { btn.textContent = '▶'; tick(); });
    audio.addEventListener('pause', () => { btn.textContent = '▶'; });
    audio.addEventListener('play', () => { btn.textContent = '❚❚'; tick(); });
    btn.onclick = () => {
      if (audio.paused) { stopLoop(); if (playing && playing !== audio) playing.pause(); playing = audio; audio.play(); }
      else audio.pause();
    };

    // click = seek, drag = select a region
    let down = null;
    const tAt = e => { const r = cv.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur(); };
    cv.addEventListener('pointerdown', e => { if (!dur()) return; down = { x: e.clientX, t: tAt(e), drag: false }; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', e => {
      if (!down) return;
      if (!down.drag && Math.abs(e.clientX - down.x) > 4) { down.drag = true; if (panel.hidden) openTrim(true); }
      if (down.drag) setSel(down.t, tAt(e));
    });
    cv.addEventListener('pointerup', e => {
      if (!down) return;
      if (!down.drag && audio.duration) { audio.currentTime = tAt(e) / dur() * audio.duration; tick(); }
      down = null;
    });
    q('[data-trim]').onclick = () => openTrim(panel.hidden);
    inA.onchange = () => sel && setSel(+inA.value, sel[1]);
    inB.onchange = () => sel && setSel(sel[0], +inB.value);
    snapSel.onchange = () => sel && setSel(sel[0], sel[1]);

    // seamless loop preview through Web Audio
    const loopBtn = q('[data-loop]');
    function startLoop() {
      if (!decoded || !sel) return;
      stopLoop(); if (playing) playing.pause();
      const src = ac().createBufferSource();
      src.buffer = decoded; src.loop = true; src.loopStart = sel[0]; src.loopEnd = sel[1];
      src.connect(ac().destination); ac().resume(); src.start(0, sel[0]);
      looping = { src, owner: el, done: () => { loopBtn.textContent = '▶ Loop region'; } };
      loopBtn.textContent = '■ Stop loop';
    }
    loopBtn.onclick = () => (looping && looping.owner === el ? stopLoop() : startLoop());

    q('[data-save]').onclick = async () => {
      if (!decoded || !sel) return;
      const sr = decoded.sampleRate, s0 = Math.round(sel[0] * sr), s1 = Math.round(sel[1] * sr), n = s1 - s0;
      const fade = Math.min(Math.round(sr * 0.003), n >> 2);   // 3 ms edges avoid clicks; loops stay seamless enough
      const ch = [];
      for (let c = 0; c < Math.min(2, decoded.numberOfChannels); c++) {
        const x = decoded.getChannelData(c).slice(s0, s1);
        for (let i = 0; i < fade; i++) { const g = i / fade; x[i] *= g; x[n - 1 - i] *= g; }
        ch.push(x);
      }
      const wav = encodeWav(ch, sr);
      const tag = `${sel[0].toFixed(2)}-${sel[1].toFixed(2)}s`;
      const tr = { role: f.role + '-trim-' + tag.replace(/\./g, '_'), label: `${f.label} · trim ${tag}${bpm && unit() ? ` (${q('[data-len]').textContent.split('·')[1].trim()})` : ''}`, prompt: '' };
      const saved = run && await Store.getRun(run.id);
      if (!saved) { downloadBlob(wav, (f.file || 'clip').replace(/\.\w+$/, '') + '_trim_' + tag + '.wav'); setStatus('Trim downloaded.'); return; }
      await addFile(saved, tr, wav, 'audio/wav', { clips: el.parentNode, after: el });
      await Store.putRun(saved);
      if (run.files !== saved.files) run.files = saved.files;
      setStatus(`Trimmed ${tag} saved to this run${Store.folderName() ? ' and the output folder' : ''}. Trimming is free.`);
      renderHistory();
    };

    new ResizeObserver(draw).observe(cv);
    // decode for the waveform, trimming and loop preview (failure just leaves a flat bar)
    blob.arrayBuffer().then(ab => ac().decodeAudioData(ab)).then(b => {
      decoded = b;
      const d = b.getChannelData(0), N = 600, step = Math.max(1, Math.floor(d.length / N)), p = new Float32Array(N);
      let mx = 0;
      for (let i = 0; i < N; i++) { let m = 0; for (let j = i * step, e = Math.min(d.length, j + step); j < e; j += 4) { const a = Math.abs(d[j]); if (a > m) m = a; } p[i] = m; if (m > mx) mx = m; }
      peaks = p.map(x => mx ? x / mx : 0); draw();
    }).catch(() => { q('[data-trim]').hidden = true; });
    return el;
  }

  function downloadBlob(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  // ---------- history ----------
  async function renderHistory() {
    let runs = [];
    try { runs = await Store.allRuns(); } catch (e) { $('histEmpty').textContent = 'History is unavailable in this browser mode: ' + e.message; return; }
    if ($('starOnly').checked) runs = runs.filter(r => r.starred);
    $('histEmpty').hidden = runs.length > 0;
    $('history').innerHTML = runs.map(r => {
      const when = new Date(r.timestamp);
      const sl = r.sliders || {};
      return `<li class="hrun${r.id === currentRunId ? ' cur' : ''}" data-id="${esc(r.id)}">
        <div class="h1">
          <button type="button" class="star${r.starred ? ' on' : ''}" data-act="star" aria-pressed="${!!r.starred}" aria-label="Star">${r.starred ? '★' : '☆'}</button>
          <button type="button" class="main" data-act="restore" title="Restore these genres and settings">
            <span class="gn">${esc((r.genreNames || r.genres || []).join(' + '))}</span>
            <span class="meta">${when.toLocaleDateString()} ${when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${esc(sl.mood || '')} · ${sl.tempo || '?'} BPM${(() => { const k = Mix.keyLabel(sl.key, sl.root, sl.mode); return k ? ' · ' + esc(k) : ''; })()} · ${r.length === 'full' ? 'song' : 'clip'} · ${esc(r.mode || 'mix')} · seed ${r.seed}${r.seedSent === false ? ' (not sent)' : ''}</span>
          </button>
        </div>
        <div class="row" style="margin-top:4px">
          <span class="rate" role="group" aria-label="Rating">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-act="rate" data-n="${n}" class="${n <= (r.rating || 0) ? 'on' : ''}" aria-label="${n} star${n > 1 ? 's' : ''}">★</button>`).join('')}</span>
          <span class="spacer"></span><span class="meta hint" style="margin:0">${(r.files || []).length} file${(r.files || []).length === 1 ? '' : 's'}</span>
        </div>
        <details><summary>Clips, prompt and notes</summary>
          <div class="clips" data-clips></div>
          <p class="ptxt">${esc(r.prompt || '')}</p>
          <textarea rows="2" data-act="notes" placeholder="Notes">${esc(r.notes || '')}</textarea>
          <div class="acts"><button type="button" class="ghost small" data-act="restore">Restore</button><button type="button" class="ghost small" data-act="delete">Delete</button></div>
        </details>
      </li>`;
    }).join('');
  }

  async function updateRun(id, fn) { const r = await Store.getRun(id); if (!r) return; fn(r); await Store.putRun(r); return r; }

  async function onHistoryClick(e) {
    const b = e.target.closest('[data-act]'), li = e.target.closest('.hrun');
    if (!b || !li || b.tagName === 'TEXTAREA') return;
    const id = li.dataset.id, act = b.dataset.act;
    if (act === 'star') { await updateRun(id, r => r.starred = !r.starred); renderHistory(); }
    else if (act === 'rate') { const n = +b.dataset.n; await updateRun(id, r => r.rating = r.rating === n ? 0 : n); renderHistory(); }
    else if (act === 'restore') restoreRun(await Store.getRun(id));
    else if (act === 'delete') { if (confirm('Delete this run and its clips from this browser? Files already written to your output folder are kept.')) { await Store.deleteRun(id); renderHistory(); } }
  }
  async function onHistoryChange(e) {
    if (e.target.dataset.act !== 'notes') return;
    const id = e.target.closest('.hrun').dataset.id, v = e.target.value;
    await updateRun(id, r => r.notes = v);
  }
  async function onHistoryToggle(e) {
    const d = e.target;
    if (d.tagName !== 'DETAILS' || !d.open || d.dataset.loaded) return;
    d.dataset.loaded = 1;
    const run = await Store.getRun(d.closest('.hrun').dataset.id), box = d.querySelector('[data-clips]');
    for (const f of run.files || []) {
      const blob = await Store.getAudio(run.id, f.role);
      if (blob) box.appendChild(player(blob, f, run));
      else box.insertAdjacentHTML('beforeend', `<p class="hint">${esc(f.label)}: audio not stored in this browser (${esc(f.path)})</p>`);
    }
    if (!(run.files || []).length) box.innerHTML = '<p class="hint">No clips.</p>';
  }

  function restoreRun(r) {
    if (!r) return;
    S.genres = (r.genres || []).filter(id => IDX.byId[id]);
    const sl = r.sliders || {};
    if (Number.isFinite(sl.tempo)) S.tempo = sl.tempo;
    if (Number.isFinite(sl.energy)) S.energy = sl.energy;
    if (Mix.MOODS.includes(sl.mood)) S.mood = sl.mood;
    if (Mix.KEY_FEELS[sl.key]) S.key = sl.key;
    S.root = Mix.KEY_ROOTS.some(x => x.id === sl.root) ? sl.root : '';   // older runs had no root: Lyria chose
    S.mode = Mix.MODES.some(x => x.id === sl.mode) ? sl.mode : '';
    if (sl.arrangement in Mix.ARRANGEMENTS) S.arrangement = sl.arrangement;
    S.seed = r.seed | 0; S.seedRandom = false;
    S.stems = r.mode === 'stems' || r.mode === 'mix+split'; S.split = r.mode === 'mix+split';
    S.length = Lyria.LYRIA.LENGTHS[r.length] ? r.length : 'clip';   // runs from before the option were clips
    S.promptEdited = !!r.promptEdited && r.prompt !== Mix.composePrompt(IDX, ps());
    if (S.promptEdited) S.prompt = r.prompt;
    tempoTouched = true; currentRunId = r.id;
    applyStateToControls(); renderAll(); renderHistory();
    setStatus(`Restored ${r.genreNames ? r.genreNames.join(' + ') : 'run'} with seed ${r.seed} locked. Tweak and generate again.`);
    document.querySelector('.mixbar').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------- info tooltips ----------
  /* Every <button class="info" data-info="key"> shows INFO[key] in one shared popup (#tip):
     on hover and keyboard focus, or on tap for touch screens. Esc, scrolling or moving away hides it. */
  const INFO = {
    dry: ['Dry run', 'Shows the exact request that would be sent to Google, and what it would cost, without calling the API. Nothing is charged. Turn it off when you’re ready to generate for real.'],
    apikey: ['Gemini API key', 'Your key from Google AI Studio. It stays in this browser and is sent only to Google in a request header. Restrict it to the Generative Language API and this site in Google Cloud.'],
    remember: ['Remember the key', 'Keeps the key in this browser’s storage so you don’t have to paste it each visit. Leave it off on shared computers; Forget removes it.'],
    balance: ['Prepay balance', 'Google has no way to read your balance automatically. Type the figure AI Studio shows; the app subtracts about $0.04 per clip or $0.08 per song and shows what’s left next to Current mix. Only this browser sees it.'],
    balanceBadge: ['Balance remaining', 'Your estimated Gemini prepay balance: the figure you entered minus about $0.04 per clip or $0.08 per song since then. Amber means under about 10 generations left, red means it’s used up. Click it to update the figure from AI Studio.'],
    folder: ['Output folder', 'Chrome or Edge only. Pick a folder and every run is written to output/<timestamp>_<genres>/, with history.json kept up to date beside it. Without one, clips stay in this browser with download links.'],
    mix: ['Current mix', 'The genres you picked, in order. The first is the primary style and leads the prompt; the rest are blended in as secondary elements. ↑ makes one primary, × removes it. The clash badge shows how far apart they are.'],
    surprise: ['Surprise me', 'Picks 2–3 random genres, weighted toward a clash score of 0.4–0.7: different enough to be interesting, close enough not to be noise. Your other settings stay as they are.'],
    genres: ['Genres', '{n} genres in {f} families. Click a chip to add or remove it; the number on a chip is its place in the mix. Type in search to filter; Enter adds the first match, Esc clears. Collapse all folds the families.'],
    tempo: ['Tempo', 'Beats per minute. It jumps to the middle of the primary genre’s typical range when the primary changes; the hint shows that range. Trim also uses it to snap to bars and beats.'],
    energy: ['Energy', 'How intense the track is, from low (calm, sparse) to high (driving, dense). It becomes “low energy”, “medium energy” and so on in the prompt.'],
    mood: ['Mood', 'The emotional color of the track. It’s the first word of the prompt, e.g. “Dreamy house track…”.'],
    key: ['Key', 'Major sounds bright, minor darker, modal uses one of the seven modes, ambiguous avoids a clear home key. Add a key from the menu below, or leave it on Any to let Lyria choose.'],
    root: ['Key menu', 'The home note. Any key lets Lyria choose. A chosen key is spelled the way musicians write it for that scale, e.g. D-flat major but C-sharp minor. Stems all share it.'],
    mode: ['Mode', 'Shown when Modal is selected. The seven modes run from brightest (Lydian, dreamy) to darkest (Locrian, unstable). Ionian is the same as major and Aeolian the same as natural minor. Any mode lets Lyria choose.'],
    arrangement: ['Arrangement', 'The track’s shape: a gradual build-up, building to a drop, stripped-down, or loop-friendly with a steady groove. None leaves it to the model.'],
    seed: ['Seed', 'The model’s dice roll. The style comes from the prompt; the seed picks which take you get. Same prompt + same seed gives the same track again, so lock it to hear the effect of changing one setting.'],
    seedRandom: ['New random seed', 'On: every Generate rolls a new seed, so you get a different track from the same recipe. Off: the seed is locked. Restoring a run from history locks its seed.'],
    prompt: ['Lyria prompt', 'The text sent to Lyria, rebuilt live from your choices. You can edit it directly; live updates then pause until you press Reset. English only, and don’t name real artists.'],
    length: ['Length', 'Clip: always 30 seconds, about $0.04. Full song: about 2–3 minutes, about $0.08. You pay per generation, not per second, so trimming afterwards doesn’t lower the cost.'],
    stems: ['Stems', 'Makes four separate generations (drums, bass, chords and pads, melody) with the same tempo, key and seed. Four times the cost, and as separate takes they may not line up perfectly.'],
    split: ['gp-master splitter', 'Generates one mix, then separates drums, bass and “other” in your browser with gp-master. Costs one generation and the parts line up exactly. Downloads about 60 MB of models the first time.'],
    generate: ['Generate and cost', 'Sends the prompt to Lyria. The estimate shows the cost before you click, and what your balance would be afterwards. Requests run one at a time; Cancel stops the rest.'],
    history: ['History', 'Every run you generate, newest first. Click one to restore its genres, settings, key and seed. ☆ stars a run, the 1–5 stars rate it, and the notes box is for your comments.'],
    starOnly: ['★ only', 'Show only runs you’ve starred.'],
    exportImport: ['Export and import', 'Export saves your history (settings, prompts, ratings, notes) as history.json. Import merges one back in. Audio isn’t included; it stays in the browser that made it.'],
    trim: ['Trim', 'Drag across the waveform to pick a region; it snaps to bars or beats at the run’s tempo. Loop region plays it on repeat; Save trimmed WAV adds the cut to this run. Free, as it all happens in your browser.']
  };
  const tip = $('tip');
  let tipFor = null, tipShownAt = 0;
  function initInfo(root) {
    (root || document).querySelectorAll('button.info:not([data-ready])').forEach(b => {
      const t = INFO[b.dataset.info];
      if (!t) return;
      b.dataset.ready = 1; b.textContent = 'i'; b.setAttribute('aria-label', 'About ' + t[0]);
    });
  }
  function showTip(b) {
    const t = INFO[b.dataset.info]; if (!t) return;
    const body = t[1].replace('{n}', IDX ? IDX.list.length : 'All').replace('{f}', IDX ? IDX.families.length : 'their');
    tip.innerHTML = `<b>${esc(t[0])}</b>${esc(body)}`;
    if (tip.hidden || tipFor !== b) tipShownAt = Date.now();
    tip.hidden = false; tipFor = b; b.setAttribute('aria-describedby', 'tip');
    const r = b.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight, m = 8;
    let x = r.left + r.width / 2 - w / 2, y = r.bottom + 8;
    if (y + h > innerHeight - m) y = r.top - h - 8;
    tip.style.left = Math.max(m, Math.min(x, innerWidth - w - m)) + 'px';
    tip.style.top = Math.max(m, y) + 'px';
  }
  function hideTip() { if (tipFor) tipFor.removeAttribute('aria-describedby'); tip.hidden = true; tipFor = null; }
  document.addEventListener('pointerover', e => { const b = e.target.closest('button.info'); if (b && e.pointerType !== 'touch') showTip(b); });
  document.addEventListener('pointerout', e => { const b = e.target.closest('button.info'); if (b && e.pointerType !== 'touch' && !b.contains(e.relatedTarget)) hideTip(); });
  document.addEventListener('focusin', e => { if (e.target.matches('button.info')) showTip(e.target); });
  document.addEventListener('focusout', e => { if (e.target.matches('button.info')) hideTip(); });
  document.addEventListener('click', e => {
    const b = e.target.closest('button.info');
    if (b) {
      e.preventDefault(); e.stopPropagation();   // never toggles the checkbox label it sits in
      // A tap focuses the button (showing the tip) and then clicks it: only a later tap closes it.
      const fresh = Date.now() - tipShownAt < 400;
      if (tipFor === b && !tip.hidden && !fresh && e.pointerType !== 'mouse') hideTip(); else showTip(b);
    }
    else if (!e.target.closest('#tip')) hideTip();
  }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hideTip(); });
  // Follow the button while the page scrolls; hide once it leaves the screen.
  const retip = () => {
    if (!tipFor || tip.hidden) return;
    const r = tipFor.getBoundingClientRect();
    if (!tipFor.isConnected || r.bottom < 0 || r.top > innerHeight) hideTip(); else showTip(tipFor);
  };
  addEventListener('scroll', retip, { passive: true, capture: true });
  addEventListener('resize', retip);
  new MutationObserver(() => initInfo()).observe(document.body, { childList: true, subtree: true });
  initInfo();

  // test hooks (harmless in production)
  window.Randomash = { state: S, setGenres, surprise: () => $('surprise').click(), composed };

  boot();
})();
