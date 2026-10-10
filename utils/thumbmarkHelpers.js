const THUMBMARK_VERIFY_URL = 'https://you-chords.com/verify';
const THUMBMARK_RESULT_PREFIX = 'youchords_thumbmark_result_';
const THUMBMARK_REQUEST_TIMEOUT_MS = 60 * 1000;

function buildThumbmarkVerifyUrl(requestId, { challengeId = null } = {}) {
  const extensionId = chrome?.runtime?.id;
  if (!extensionId) return null;
  const params = new URLSearchParams({
    req: requestId,
    ext: extensionId
  });
  if (typeof challengeId === 'string' && challengeId.trim()) {
    params.set('challenge', challengeId.trim());
  }
  return `${THUMBMARK_VERIFY_URL}?${params.toString()}`;
}

function waitForThumbmarkResult(resultKey, timeoutMs = THUMBMARK_REQUEST_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    let finished = false;
    const timeoutId = setTimeout(() => {
      if (finished) return;
      finished = true;
      chrome.storage.onChanged.removeListener(onChange);
      reject(new Error('Device verification timed out'));
    }, timeoutMs);

    const onChange = (changes, areaName) => {
      if (finished || areaName !== 'local') return;
      if (!changes[resultKey]) return;
      finished = true;
      clearTimeout(timeoutId);
      chrome.storage.onChanged.removeListener(onChange);
      resolve(changes[resultKey].newValue || null);
    };

    chrome.storage.onChanged.addListener(onChange);
  });
}

async function requestThumbmarkVisitorId(options = {}) {
  if (!chrome?.tabs?.create || !chrome?.storage?.local) {
    throw new Error('Device verification unavailable');
  }

  const challengeId = typeof options?.challengeId === 'string' && options.challengeId.trim()
    ? options.challengeId.trim()
    : null;
  const requestId = `tm_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const resultKey = `${THUMBMARK_RESULT_PREFIX}${requestId}`;
  const verifyUrl = buildThumbmarkVerifyUrl(requestId, { challengeId });
  if (!verifyUrl) throw new Error('Device verification unavailable');

  await new Promise((resolve) => {
    chrome.tabs.create({ url: verifyUrl, active: false }, () => resolve(true));
  });

  const result = await waitForThumbmarkResult(resultKey);
  await chrome.storage.local.remove([resultKey]);

  if (result?.visitorId) {
    return {
      visitorId: result.visitorId,
      challengeId: typeof result?.challengeId === 'string' && result.challengeId.trim()
        ? result.challengeId.trim()
        : challengeId,
      thumbmark: typeof result?.thumbmark === 'string' ? result.thumbmark : null,
      deviceProof: typeof result?.deviceProof === 'string' ? result.deviceProof : null,
      deviceProofs: Array.isArray(result?.deviceProofs)
        ? result.deviceProofs.filter((entry) => typeof entry === 'string')
        : []
    };
  }

  throw new Error(result?.error || 'Device verification failed');
}

export {
  THUMBMARK_VERIFY_URL,
  THUMBMARK_RESULT_PREFIX,
  THUMBMARK_REQUEST_TIMEOUT_MS,
  buildThumbmarkVerifyUrl,
  waitForThumbmarkResult,
  requestThumbmarkVisitorId
};
