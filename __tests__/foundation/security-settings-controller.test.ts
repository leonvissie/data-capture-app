import { createSecuritySettingsController } from '../../src/features/settings/hooks/useSecuritySettings';

describe('security settings controller', () => {
  test('auto-lock update path persists and updates local prefs', async () => {
    const updatePrefs = jest.fn(async (next: { autoLockMinutes?: number; biometricEnabled?: boolean }) => ({
      profileId: 'p1',
      hasCompletedOnboarding: false,
      hasCompletedTour: false,
      tourVersion: 1,
      preferredThemeMode: 'system' as const,
      autoLockMinutes: next.autoLockMinutes ?? 1,
      biometricEnabled: false,
      createdAt: '',
      updatedAt: '',
    }));
    const setPrefs = jest.fn();

    const controller = createSecuritySettingsController({
      getPrefs: () => ({
        profileId: 'p1',
        hasCompletedOnboarding: false,
        hasCompletedTour: false,
        tourVersion: 1,
        preferredThemeMode: 'system',
        autoLockMinutes: 1,
        biometricEnabled: false,
        createdAt: '',
        updatedAt: '',
      }),
      setPrefs,
      biometricSupported: true,
      platformOS: 'ios',
      updatePrefs,
      alert: jest.fn(),
      openSettings: jest.fn(async () => {}),
      lock: jest.fn(),
      requestDestructiveReset: jest.fn(async () => {}),
    });

    await controller.setAutoLockMinutes(5);
    expect(updatePrefs).toHaveBeenCalledWith({ autoLockMinutes: 5 });
    expect(setPrefs).toHaveBeenCalled();
  });

  test('biometric unavailable path shows alert and does not persist', async () => {
    const updatePrefs = jest.fn();
    const alert = jest.fn();

    const controller = createSecuritySettingsController({
      getPrefs: () => ({
        profileId: 'p1',
        hasCompletedOnboarding: false,
        hasCompletedTour: false,
        tourVersion: 1,
        preferredThemeMode: 'system',
        autoLockMinutes: 1,
        biometricEnabled: false,
        createdAt: '',
        updatedAt: '',
      }),
      setPrefs: jest.fn(),
      biometricSupported: false,
      platformOS: 'ios',
      updatePrefs,
      alert,
      openSettings: jest.fn(async () => {}),
      lock: jest.fn(),
      requestDestructiveReset: jest.fn(async () => {}),
    });

    await controller.setBiometricEnabled(true);
    expect(updatePrefs).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalled();
  });

  test('lock/reset actions trigger providers', async () => {
    const lock = jest.fn();
    const requestDestructiveReset = jest.fn(async () => {});

    const controller = createSecuritySettingsController({
      getPrefs: () => null,
      setPrefs: jest.fn(),
      biometricSupported: true,
      platformOS: 'ios',
      updatePrefs: jest.fn(),
      alert: jest.fn(),
      openSettings: jest.fn(async () => {}),
      lock,
      requestDestructiveReset,
    });

    controller.lockNow();
    await controller.resetNow();

    expect(lock).toHaveBeenCalledTimes(1);
    expect(requestDestructiveReset).toHaveBeenCalledTimes(1);
  });
});
