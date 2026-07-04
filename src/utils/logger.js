function ts() {
  return new Date().toISOString()
}

function fmt(level, scope, message, meta) {
  const base = `${ts()} [${level}] [${scope}] ${message}`
  if (meta === undefined) return base
  try {
    return `${base} ${typeof meta === 'string' ? meta : JSON.stringify(meta)}`
  } catch {
    return base
  }
}

export function createLogger(scope) {
  return {
    info: (message, meta) => console.log(fmt('INFO', scope, message, meta)),
    warn: (message, meta) => console.warn(fmt('WARN', scope, message, meta)),
    error: (message, meta) => console.error(fmt('ERROR', scope, message, meta)),
  }
}
