import { appConfig } from '@/config/appConfig';

export const logger = {
  debug: (...args: unknown[]) => {
    if (!appConfig.features.showDevTools) return;
    console.debug(...args);
  },
  info: (...args: unknown[]) => {
    if (!appConfig.features.showDevTools) return;
    console.info(...args);
  },
  warn: (...args: unknown[]) => {
    console.warn(...args);
  },
  error: (...args: unknown[]) => {
    console.error(...args);
  },
};
