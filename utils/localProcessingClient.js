const LOCAL_API_BASE = 'http://127.0.0.1:8765/v1';
const POLL_INTERVAL_MS = 1000;

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Request aborted', 'AbortError'));
      return;
    }
    const handleAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', handleAbort);
      reject(new DOMException('Request aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener?.('abort', handleAbort);
      resolve();
    }, ms);
    signal?.addEventListener?.('abort', handleAbort, { once: true });
  });
}

async function fetchJson(path, options = {}) {
  const response = await fetch(`${LOCAL_API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch (_) {
    payload = null;
  }
  return { response, payload };
}

function unavailableResult(error) {
  const detail = String(error?.message || error || '').trim();
  return {
    success: false,
    processingFailed: true,
    localServiceUnavailable: true,
    error: detail.includes('Failed to fetch')
      ? 'YouChords Local is not running. Start Docker with scripts/start_youchords_local.ps1 and try again.'
      : (detail || 'Could not reach YouChords Local on port 8765.')
  };
}

async function readResult(videoId, signal) {
  const { response, payload } = await fetchJson(`/results/${encodeURIComponent(videoId)}`, { signal });
  if (response.status === 404) return { success: false, notInCache: true };
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || `Local result request failed (${response.status})`);
  }
  return payload;
}

async function cancelJob(jobId) {
  try {
    await fetchJson(`/jobs/${encodeURIComponent(jobId)}`, { method: 'DELETE' });
  } catch (_) {
    // Best effort: closing the UI must not create another error.
  }
}

async function waitForJob(job, signal, onStatus = null) {
  let current = job;
  let lastStatus = '';
  while (current && !['completed', 'failed', 'cancelled'].includes(current.status)) {
    if (current.status !== lastStatus) {
      lastStatus = current.status;
      onStatus?.(current);
    }
    if (signal?.aborted) {
      await cancelJob(current.id);
      return { success: false, aborted: true, error: 'Request aborted' };
    }
    await sleep(POLL_INTERVAL_MS, signal);
    const { response, payload } = await fetchJson(`/jobs/${encodeURIComponent(current.id)}`, { signal });
    if (!response.ok || !payload?.success) {
      throw new Error(payload?.error || `Local job request failed (${response.status})`);
    }
    current = payload.job;
  }

  if (current?.status === 'completed') return { success: true };
  if (current?.status === 'cancelled') return { success: false, aborted: true, error: 'Request aborted' };
  return {
    success: false,
    processingFailed: true,
    error: current?.error || 'Local chord processing failed.'
  };
}

async function getOrProcessChords(videoId, options = {}) {
  const signal = options.signal || null;
  try {
    const cached = await readResult(videoId, signal);
    if (cached.success || !options.enqueueIfMissing) return cached;

    const { response, payload } = await fetchJson('/jobs', {
      method: 'POST',
      body: JSON.stringify({ videoId }),
      signal
    });
    if (!response.ok || !payload?.success || !payload.job) {
      throw new Error(payload?.error || `Could not start local processing (${response.status})`);
    }

    const onStatus = typeof options.onStatus === 'function' ? options.onStatus : null;
    onStatus?.(payload.job);
    const completion = await waitForJob(payload.job, signal, onStatus);
    if (!completion.success) return completion;
    return await readResult(videoId, signal);
  } catch (error) {
    if (error?.name === 'AbortError' || signal?.aborted) {
      return { success: false, aborted: true, error: 'Request aborted' };
    }
    return unavailableResult(error);
  }
}

async function getHealth() {
  try {
    const { response, payload } = await fetchJson('/health');
    if (!response.ok || !payload?.success) {
      throw new Error(payload?.error || `Health check failed (${response.status})`);
    }
    return payload;
  } catch (error) {
    return unavailableResult(error);
  }
}

export const localProcessingClient = {
  baseUrl: LOCAL_API_BASE,
  getHealth,
  getOrProcessChords
};
