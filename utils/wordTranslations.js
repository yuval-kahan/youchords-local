(() => {
  const CACHE_VERSION = 2;
  const BATCH_SIZE = 24;
  const FREE_MODELS = new Set([
    'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash',
    'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite',
    'gemini-3-flash-preview'
  ]);
  const DEFAULT_MODEL = 'gemini-3.8-flash';
  const inFlight = new Map();
  const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const malformedJsonError = (cause) => {
    const error = new Error('Gemini returned malformed word-translation data. Retrying with smaller batches may help.');
    error.code = 'YC_INVALID_TRANSLATION_JSON';
    error.cause = cause;
    return error;
  };

  function parseTranslationArray(text) {
    const source = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try {
      const parsed = JSON.parse(source);
      if (Array.isArray(parsed)) return parsed;
    } catch (error) {
      const start = source.indexOf('[');
      const end = source.lastIndexOf(']');
      if (start >= 0 && end > start) {
        try {
          const parsed = JSON.parse(source.slice(start, end + 1));
          if (Array.isArray(parsed)) return parsed;
        } catch (nestedError) {
          throw malformedJsonError(nestedError);
        }
      }
      throw malformedJsonError(error);
    }
    throw malformedJsonError();
  }
  const fingerprint = (words) => JSON.stringify(words.map((word) => [
    Math.round(Number(word.startTime) * 1000), clean(word.text)
  ]));

  async function readKeys() {
    const stored = await chrome.storage.local.get(['geminiApiKeys', 'geminiApiKey']);
    let keys = (Array.isArray(stored.geminiApiKeys) ? stored.geminiApiKeys : [])
      .filter((entry) => entry?.key && entry.active !== false && entry.status !== 'disabled')
      .map((entry) => entry.key);
    if (stored.geminiApiKey && !keys.includes(stored.geminiApiKey)) keys.unshift(stored.geminiApiKey);
    return [...new Set(keys)];
  }

  async function translateBatch(words, languages, model, keys) {
    const languageNames = { he: 'Hebrew', en: 'English' };
    const items = words.map((word, i) => `${i}\t${clean(word.text)}`).join('\n');
    const prompt = `Translate each numbered lyric word into ${languages.map((lang) => languageNames[lang]).join(' and ')}. Keep exactly one output item for every input index. Copy each source word exactly into the source field and keep its original integer i; never move a translation to another word or redistribute a sentence translation across words. Use nearby words only to understand meaning. Give a concise natural equivalent for that word in context; use an empty string only when the word has no useful standalone equivalent in the target language. Preserve proper names. Return only the requested JSON array.\n\n${items}`;
    const properties = { i: { type: 'INTEGER' }, source: { type: 'STRING' } };
    languages.forEach((language) => { properties[language] = { type: 'STRING' }; });
    const required = Object.keys(properties);
    const responseSchema = {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties,
        required,
        propertyOrdering: required
      }
    };
    let lastError;
    for (const key of keys) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json', responseSchema, temperature: 0.1 }
          })
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error?.message || `Gemini returned ${response.status}`);
        const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('');
        const parsed = parseTranslationArray(text);
        const seen = new Set();
        const valid = parsed.length === words.length && parsed.every((item) => {
          const index = Number(item?.i);
          if (!Number.isInteger(index) || index < 0 || index >= words.length || seen.has(index)) return false;
          if (clean(item?.source) !== clean(words[index]?.text)) return false;
          if (!languages.every((language) => typeof item?.[language] === 'string')) return false;
          seen.add(index);
          return true;
        });
        if (!valid) throw malformedJsonError();
        return parsed;
      } catch (error) { lastError = error; }
    }
    throw lastError || new Error('Add a valid Gemini API key in the extension popup to translate words.');
  }

  async function translateBatchWithRecovery(words, languages, model, keys) {
    try {
      return await translateBatch(words, languages, model, keys);
    } catch (error) {
      if (error?.code !== 'YC_INVALID_TRANSLATION_JSON' || words.length < 2) throw error;
      const midpoint = Math.ceil(words.length / 2);
      const first = await translateBatchWithRecovery(words.slice(0, midpoint), languages, model, keys);
      const second = await translateBatchWithRecovery(words.slice(midpoint), languages, model, keys);
      return [
        ...first,
        ...second.map((item) => ({ ...item, i: Number(item.i) + midpoint }))
      ];
    }
  }

  async function translateOnce(videoId, words, languages) {
    if (!videoId || !Array.isArray(words) || !words.length) return null;
    languages = [...new Set(languages)].filter((lang) => lang === 'he' || lang === 'en').sort();
    if (!languages.length) return null;
    const db = window.databaseManager;
    if (!db?.loadSubtitlesFromIndexedDB || !db?.saveToDatabase) throw new Error('Subtitle database is not ready.');
    const record = await db.loadSubtitlesFromIndexedDB(videoId);
    const sourceFingerprint = fingerprint(words);
    const cached = record?.wordTranslations;
    const storedModel = await chrome.storage.local.get(['geminiGlobalModel']);
    const model = FREE_MODELS.has(storedModel.geminiGlobalModel) ? storedModel.geminiGlobalModel : DEFAULT_MODEL;
    const matches = cached?.version === CACHE_VERSION && cached.fingerprint === sourceFingerprint && cached.model === model && JSON.stringify(cached.languages) === JSON.stringify(languages);
    if (matches && cached.values?.length === words.length) return cached.values;

    const keys = await readKeys();
    if (!keys.length) throw new Error('Add a valid Gemini API key in the extension popup first.');
    const values = Array.from({ length: words.length }, () => ({}));
    for (let offset = 0; offset < words.length; offset += BATCH_SIZE) {
      const batch = words.slice(offset, offset + BATCH_SIZE);
      const translated = await translateBatchWithRecovery(batch, languages, model, keys);
      translated.forEach((item) => {
        const localIndex = Number(item?.i);
        if (!Number.isInteger(localIndex) || localIndex < 0 || localIndex >= batch.length) return;
        for (const lang of languages) values[offset + localIndex][lang] = clean(item[lang]);
      });
      if (translated.length !== batch.length) throw new Error('Gemini returned an incomplete batch. Retry the translation.');
    }
    await db.saveToDatabase('subtitles', videoId, {
      wordTranslations: { version: CACHE_VERSION, fingerprint: sourceFingerprint, model, languages, values, updatedAt: Date.now() }
    });
    return values;
  }

  async function translate(videoId, words, languages) {
    const storedModel = await chrome.storage.local.get(['geminiGlobalModel']);
    const model = FREE_MODELS.has(storedModel.geminiGlobalModel) ? storedModel.geminiGlobalModel : DEFAULT_MODEL;
    const requestKey = `${videoId}|${fingerprint(words)}|${[...languages].sort().join(',')}|${model}`;
    if (inFlight.has(requestKey)) return inFlight.get(requestKey);
    const request = translateOnce(videoId, words, languages).finally(() => inFlight.delete(requestKey));
    inFlight.set(requestKey, request);
    return request;
  }

  window.ycWordTranslations = { translate };
})();
