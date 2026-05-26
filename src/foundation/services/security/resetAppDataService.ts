import { resetStorage } from '@/foundation/services/storage/database';
import { getOrCreateUserPrefs } from '@/foundation/services/storage/userPrefsRepository';

import { clearPinCredentials } from './pinPolicy';

export async function resetAppDataAndCredentials(): Promise<void> {
  await resetStorage();
  await clearPinCredentials();
  await getOrCreateUserPrefs();
}
