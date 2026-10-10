(function installYouChordsProductionConsole(root) {
  if (!root || root.__ycProductionConsoleInstalled) return;
  root.__ycProductionConsoleInstalled = true;

  const methods = ['log', 'debug', 'info', 'warn', 'error'];
  const originalConsole = root.__ycOriginalConsole || {};
  const currentConsole = root.console || {};

  methods.forEach((method) => {
    const original = currentConsole[method];
    originalConsole[method] = typeof original === 'function'
      ? original.bind(currentConsole)
      : function noop() {};
  });

  root.__ycOriginalConsole = originalConsole;

  function sanitizeDiagnosticText(value, maxLength) {
    let text = '';

    if (value instanceof Error) {
      text = `${value.name || 'Error'}: ${value.message || ''}`;
    } else if (typeof value === 'string') {
      text = value;
    } else {
      try {
        text = JSON.stringify(value);
      } catch (_) {
        text = String(value);
      }
    }

    text = String(text || '')
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[email]')
      .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]')
      .replace(/([?&](?:jwt|token|key|apiKey|authorization)=)[^&\s]+/gi, '$1[redacted]')
      .replace(/\s+/g, ' ')
      .trim();

    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
  }

  function pushDiagnosticConsoleEvent(method, args) {
    if (method !== 'warn' && method !== 'error') return;

    const state = root.__ycDiagnosticsState;
    if (!state || Date.now() >= Number(state.activeUntil || 0)) return;

    const message = Array.from(args || [])
      .map((item) => sanitizeDiagnosticText(item, 160))
      .filter(Boolean)
      .join(' ');

    if (!message) return;

    const event = {
      at: new Date().toISOString(),
      type: `console.${method}`,
      message: sanitizeDiagnosticText(message, 220),
      details: { source: 'muted_console' }
    };

    state.events = Array.isArray(state.events) ? state.events : [];
    state.events.push(event);
    if (state.events.length > 80) {
      state.events.splice(0, state.events.length - 80);
    }
  }

  methods.forEach((method) => {
    currentConsole[method] = function mutedYouChordsConsole(...args) {
      pushDiagnosticConsoleEvent(method, args);
    };
  });

  root.console = currentConsole;
})(typeof globalThis !== 'undefined' ? globalThis : this);
