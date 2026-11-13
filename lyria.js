/* Lyria 3 client (Gemini API, generateContent), called straight from the browser.
   The key is sent only in the x-goog-api-key header to Google, never in a URL or log. */
(function (root) {
  'use strict';

  // ---- config: the one place to change model, endpoint and pricing ----
  const LYRIA = {
    MODEL: 'lyria-3-clip-preview',          // 30-second clips. Other IDs seen in the docs: lyria-3-pro-preview, lyria-3.5
    API: 'https://generativelanguage.googleapis.com/v1beta/',
    COST_PER_CLIP_USD: 0.04,                // estimate for lyria-3-clip-preview; check ai.google.dev/pricing
    MAX_RETRIES: 3,                         // retries after the first try, for transient errors only
    BACKOFF_MS: 1500,                       // 1.5 s, 3 s, 6 s (+ jitter)
    TIMEOUT_MS: 180000,
    SEND_SEED: true                         // dropped automatically if the API rejects the seed field
  };

  class LyriaError extends Error {
    constructor(msg, extra) { super(msg); Object.assign(this, extra || {}); }
  }

  const TRANSIENT = new Set([408, 429, 500, 502, 503, 504]);
  const BLOCK_REASONS = new Set(['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION', 'IMAGE_SAFETY', 'OTHER']);
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function requestBody(prompt, seed, withSeed) {
    const body = { contents: [{ role: 'user', parts: [{ text: prompt }] }] };
    if (withSeed && Number.isFinite(seed)) body.generationConfig = { seed: seed | 0 };
    return body;
  }

  // Pull audio and any text out of a generateContent response. Accepts camelCase and snake_case.
  function parseResponse(data) {
    const pf = data.promptFeedback || data.prompt_feedback;
    if (pf && (pf.blockReason || pf.block_reason)) {
      const why = pf.blockReason || pf.block_reason;
      throw new LyriaError(refusalText(why, pf.blockReasonMessage || pf.block_reason_message), { refused: true, reason: why });
    }
    const cand = (data.candidates || [])[0];
    const parts = (cand && cand.content && cand.content.parts) || [];
    const audio = [], text = [];
    for (const p of parts) {
      const d = p.inlineData || p.inline_data;
      if (d && d.data) audio.push({ mime: d.mimeType || d.mime_type || 'audio/mpeg', b64: d.data });
      else if (p.text) text.push(p.text);
    }
    if (!audio.length) {
      const fr = cand && (cand.finishReason || cand.finish_reason);
      if (!cand || BLOCK_REASONS.has(fr))
        throw new LyriaError(refusalText(fr || 'NO_CANDIDATE', cand && cand.finishMessage, text.join(' ')), { refused: true, reason: fr || 'NO_CANDIDATE' });
      throw new LyriaError('The model answered without audio' + (text.length ? ': ' + text.join(' ').slice(0, 400) : '.'), { refused: true, reason: fr || 'NO_AUDIO' });
    }
    return { audio: audio[0], extraAudio: audio.slice(1), text: text.join('\n').trim(), finishReason: cand.finishReason || cand.finish_reason || '' };
  }

  function refusalText(reason, msg, modelText) {
    const base = {
      SAFETY: 'The safety filter blocked this prompt.',
      PROHIBITED_CONTENT: 'The prompt was refused as prohibited content.',
      BLOCKLIST: 'The prompt contains a blocked term.',
      RECITATION: 'The result was blocked because it was too close to existing material. Try naming fewer specific styles or changing the instruments.',
      SPII: 'The prompt was refused because it looks like it contains personal information.',
      NO_CANDIDATE: 'The model returned no result for this prompt.'
    }[reason] || ('The request was refused (' + reason + ').');
    return [base, msg, modelText].filter(Boolean).join(' ');
  }

  function apiMessage(status, data) {
    const e = data && data.error;
    return (e && e.message) ? e.message : 'HTTP ' + status;
  }

  /* Generate one clip. Retries transient errors with exponential backoff.
     opts: { key, prompt, seed, signal, onStatus(text) }
     Returns { bytes: Uint8Array, mime, text, seedSent, attempts }. */
  async function generate(opts) {
    if (!opts.key) throw new LyriaError('Add your Gemini API key first.');
    let withSeed = LYRIA.SEND_SEED, attempt = 0;
    const say = opts.onStatus || (() => {});
    for (;;) {
      attempt++;
      const ac = new AbortController(), timer = setTimeout(() => ac.abort(new Error('timeout')), LYRIA.TIMEOUT_MS);
      if (opts.signal) opts.signal.addEventListener('abort', () => ac.abort(opts.signal.reason), { once: true });
      let res, data, netErr = null;
      try {
        res = await fetch(LYRIA.API + 'models/' + encodeURIComponent(LYRIA.MODEL) + ':generateContent', {
          method: 'POST', signal: ac.signal,
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': opts.key },
          body: JSON.stringify(requestBody(opts.prompt, opts.seed, withSeed))
        });
        data = await res.json().catch(() => ({}));
      } catch (e) {
        if (opts.signal && opts.signal.aborted) throw new LyriaError('Cancelled.');
        netErr = e;
      } finally { clearTimeout(timer); }

      if (!netErr && res.ok) {
        const out = parseResponse(data);            // throws LyriaError({refused}) on a block
        return { bytes: b64ToBytes(out.audio.b64), mime: out.audio.mime, text: out.text, seedSent: withSeed, attempts: attempt };
      }

      // The seed field is not supported by every model: drop it once and retry immediately.
      if (!netErr && res.status === 400 && withSeed && /seed|generation_?config|unknown name/i.test(apiMessage(400, data))) {
        withSeed = false; say('This model rejected the seed setting; retrying without it…'); attempt--; continue;
      }
      if (!netErr && res.status === 400 && /safety|policy|prohibit|blocked/i.test(apiMessage(400, data)))
        throw new LyriaError(apiMessage(400, data), { refused: true, reason: 'POLICY' });

      const transient = netErr || TRANSIENT.has(res.status);
      if (!transient || attempt > LYRIA.MAX_RETRIES) {
        if (netErr) throw new LyriaError('Network error: ' + (netErr.message || netErr) + '. If this keeps happening, check your connection or an ad blocker.');
        if (res.status === 401 || res.status === 403) throw new LyriaError('The API key was not accepted (' + res.status + '): ' + apiMessage(res.status, data));
        if (res.status === 404) throw new LyriaError('Model ' + LYRIA.MODEL + ' was not found (404). The model ID may have changed; update LYRIA.MODEL in lyria.js. ' + apiMessage(404, data));
        throw new LyriaError(apiMessage(res.status, data) + (attempt > 1 ? ' (after ' + attempt + ' tries)' : ''), { status: res.status });
      }
      const ra = res && +res.headers.get('retry-after');
      const wait = ra ? ra * 1000 : LYRIA.BACKOFF_MS * 2 ** (attempt - 1) + Math.random() * 400;
      say('Temporary error (' + (netErr ? 'network' : res.status) + '). Retry ' + attempt + ' of ' + LYRIA.MAX_RETRIES + ' in ' + Math.round(wait / 1000) + ' s…');
      await sleep(wait);
    }
  }

  function b64ToBytes(b64) {
    const bin = atob(b64), out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  const extFor = mime => /wav/i.test(mime) ? 'wav' : /ogg|opus/i.test(mime) ? 'ogg' : /flac/i.test(mime) ? 'flac' : /aac|mp4|m4a/i.test(mime) ? 'm4a' : 'mp3';

  const api = { LYRIA, LyriaError, generate, requestBody, parseResponse, extFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Lyria = api;
})(typeof self !== 'undefined' ? self : this);
