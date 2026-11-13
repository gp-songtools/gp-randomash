/* Randomash storage.
   - IndexedDB "randomash": runs (history entries), audio (clip blobs), meta (output-folder handle).
   - Optional output folder (Chrome/Edge File System Access API): each run is written to
     <folder>/output/<timestamp>_<slug>/<role>.<ext>, and <folder>/history.json is rewritten after every change. */
(function (root) {
  'use strict';
  const DB = 'randomash', VER = 1;
  let dbp = null;

  function db() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB, VER);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('runs')) d.createObjectStore('runs', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('audio')) d.createObjectStore('audio', { keyPath: 'key' });
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'k' });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }

  // Run synchronous writes in one transaction; resolves when it commits.
  async function tx(store, mode, fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction(store, mode);
      fn(t.objectStore(store));
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error || new Error('transaction aborted'));
    });
  }
  const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

  async function allRuns() {
    const d = await db();
    const runs = await req(d.transaction('runs').objectStore('runs').getAll());
    return runs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }
  async function getRun(id) { const d = await db(); return req(d.transaction('runs').objectStore('runs').get(id)); }
  async function putRun(run) { await tx('runs', 'readwrite', s => s.put(run)); await syncFolder(); return run; }
  async function deleteRun(id) {
    const run = await getRun(id);
    await tx('runs', 'readwrite', s => s.delete(id));
    if (run) await tx('audio', 'readwrite', s => { for (const f of run.files || []) s.delete(id + '/' + f.role); });
    await syncFolder();
  }
  async function putAudio(runId, role, blob) { await tx('audio', 'readwrite', s => s.put({ key: runId + '/' + role, blob })); }
  async function getAudio(runId, role) { const d = await db(); const r = await req(d.transaction('audio').objectStore('audio').get(runId + '/' + role)); return r && r.blob; }

  // ---- history.json export / import ----
  async function exportJSON() {
    const runs = await allRuns();
    return JSON.stringify({ app: 'randomash', version: 1, exported: new Date().toISOString(), runs }, null, 2);
  }
  // Import merges by run id. Audio is not inside history.json, so imported runs may have no playable files.
  async function importJSON(text) {
    const j = JSON.parse(text), runs = Array.isArray(j) ? j : j.runs;
    if (!Array.isArray(runs)) throw new Error('This file does not look like a Randomash history.json.');
    let n = 0;
    for (const r of runs) {
      if (!r || typeof r.id !== 'string' || typeof r.timestamp !== 'string') continue;
      const cur = await getRun(r.id);
      await tx('runs', 'readwrite', s => s.put(Object.assign({}, r, cur ? { files: cur.files } : {})));
      n++;
    }
    await syncFolder();
    return n;
  }

  // ---- output folder (File System Access API) ----
  const folderSupported = () => typeof root.showDirectoryPicker === 'function';
  let dir = null;

  async function loadFolder() {
    try { const d = await db(); const m = await req(d.transaction('meta').objectStore('meta').get('dir')); dir = m ? m.h : null; }
    catch (_) { dir = null; }
    return dir;
  }
  async function chooseFolder() {
    dir = await root.showDirectoryPicker({ id: 'randomash', mode: 'readwrite' });
    await tx('meta', 'readwrite', s => s.put({ k: 'dir', h: dir }));
    await syncFolder();
    return dir;
  }
  async function forgetFolder() { dir = null; await tx('meta', 'readwrite', s => s.delete('dir')); }
  // Permission must be re-granted after a reload; this needs a user gesture when it prompts.
  async function folderReady(prompt) {
    if (!dir) return false;
    const o = { mode: 'readwrite' };
    if ((await dir.queryPermission(o)) === 'granted') return true;
    if (prompt && (await dir.requestPermission(o)) === 'granted') return true;
    return false;
  }
  const folderName = () => dir ? dir.name : '';

  async function writeFile(parts, blob) {
    let d = dir;
    for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p, { create: true });
    const fh = await d.getFileHandle(parts[parts.length - 1], { create: true });
    const w = await fh.createWritable();
    await w.write(blob); await w.close();
  }
  async function writeRunFile(relPath, blob) {
    if (!(await folderReady(false))) return false;
    await writeFile(relPath.split('/'), blob);
    return true;
  }
  async function syncFolder() {
    try {
      if (!(await folderReady(false))) return false;
      await writeFile(['history.json'], new Blob([await exportJSON()], { type: 'application/json' }));
      return true;
    } catch (e) { console.warn('history.json not written:', e); return false; }
  }

  root.Store = { allRuns, getRun, putRun, deleteRun, putAudio, getAudio, exportJSON, importJSON,
    folderSupported, loadFolder, chooseFolder, forgetFolder, folderReady, folderName, writeRunFile, syncFolder };
})(self);
