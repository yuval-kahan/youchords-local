export const LOCAL_PROCESSOR_STORAGE_KEY = 'preferredLocalProcessor';

export const LOCAL_PROCESSORS = Object.freeze({
  docker: Object.freeze({ id: 'docker', label: 'Docker', port: 8765 }),
  windows: Object.freeze({ id: 'windows', label: 'Windows', port: 8766 }),
  linux: Object.freeze({ id: 'linux', label: 'Linux', port: 8767 })
});

export const DEFAULT_LOCAL_PROCESSOR = 'docker';

export async function getPreferredLocalProcessor() {
  try {
    const stored = await chrome.storage.local.get(LOCAL_PROCESSOR_STORAGE_KEY);
    const id = stored?.[LOCAL_PROCESSOR_STORAGE_KEY];
    return LOCAL_PROCESSORS[id] ? id : DEFAULT_LOCAL_PROCESSOR;
  } catch (_) {
    return DEFAULT_LOCAL_PROCESSOR;
  }
}

export async function setPreferredLocalProcessor(id) {
  const processorId = LOCAL_PROCESSORS[id] ? id : DEFAULT_LOCAL_PROCESSOR;
  await chrome.storage.local.set({ [LOCAL_PROCESSOR_STORAGE_KEY]: processorId });
  return processorId;
}

export async function getLocalApiBase(processorId = null) {
  const selectedId = LOCAL_PROCESSORS[processorId]
    ? processorId
    : await getPreferredLocalProcessor();
  return `http://127.0.0.1:${LOCAL_PROCESSORS[selectedId].port}/v1`;
}

export async function getLocalProcessorRoot(processorId = null) {
  return (await getLocalApiBase(processorId)).replace(/\/v1$/, '');
}
