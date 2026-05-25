import { allowLogs as allowLogsForConfig } from '../config/appConfig';

type ConsoleMethod = (...args: unknown[]) => void;

const rawConsole = {
  log: console.log.bind(console) as ConsoleMethod,
  warn: console.warn.bind(console) as ConsoleMethod,
  error: console.error.bind(console) as ConsoleMethod,
};

let devModeEnabled = true;
let consoleProxyInstalled = false;

function allowLogs(): boolean {
  return allowLogsForConfig(devModeEnabled);
}

export const logger = {
  log: (...args: unknown[]) => {
    if (!allowLogs()) return;
    rawConsole.log(...args);
  },
  warn: (...args: unknown[]) => {
    if (!allowLogs()) return;
    rawConsole.warn(...args);
  },
  error: (...args: unknown[]) => {
    rawConsole.error(...args);
  },
};

export function setDevModeEnabled(enabled: boolean) {
  devModeEnabled = enabled;
}

export function installConsoleProxy() {
  if (consoleProxyInstalled) return;
  console.log = logger.log;
  console.warn = logger.warn;
  consoleProxyInstalled = true;
}

export function restoreConsoleProxy() {
  if (!consoleProxyInstalled) return;
  console.log = rawConsole.log;
  console.warn = rawConsole.warn;
  consoleProxyInstalled = false;
}
