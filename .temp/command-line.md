# Cinlo Command Line Runbook

## 1) Install dependencies

cd /Users/leonvisser/Documents/DEV/data-capture-app
npm install


## 2) Dev server / local runs

npx expo start -c

npx expo run:ios --device

npx expo run:android

## 3) Clean native regenerate (prebuild)

npx expo prebuild --clean

## 4) Versioning before release
Edit `app/app.json`:

- iOS: increment `expo.ios.buildNumber` (string, e.g. `"3"`, `"4"`).
- Android: increment `expo.android.versionCode` (integer, e.g. `2`, `3`).
- App version (both stores): bump `expo.version` (e.g. `"1.0.1"`).

Do this for every store upload.

## 5) Android release build (Play Console)
Preferred: EAS managed signing.

Build AAB:
npx eas build -p android --profile production

Notes:
- Uses release signing (not debug).
- Download `.aab` from EAS build page.
- Upload `.aab` to Play Console (Internal testing first).

## 6) iOS release build (App Store Connect / TestFlight)
npx eas build -p ios --profile production
```

Then submit:

```bash
npx eas submit -p ios --latest
```

Notes:
- Ensure Apple account/team and cert/profiles are configured in EAS.
- TestFlight is the normal first step before App Store review.

## 7) Android submission
After Android build completes:

1. Open Play Console.
2. Go to `Testing` -> `Internal testing`.
3. Create release.
4. Upload the generated `.aab`.
5. Add release notes.
6. Roll out to testers.

## 8) iOS submission
After iOS build:

1. Submit via `eas submit` or Transporter.
2. In App Store Connect, configure build metadata.
3. Add testers in TestFlight.
4. Distribute to internal/external testers.

## 9) Store readiness checklist
Before uploading:

- Bundle IDs / package names are final:
  - iOS `com.ureondigital.cinlo`
  - Android `com.ureondigital.cinlo`
- App icons and splash assets set.
- Privacy policy URL ready.
- Support URL ready.
- Age rating/content declarations complete.
- Screenshots prepared for required device sizes.
- Release notes prepared.

## 10) Useful troubleshooting
Type check:

```bash
cd app
npx tsc --noEmit
```

Reset Metro cache:

```bash
npx expo start -c
```

If local Android build gets stale:

```bash
cd app/android
./gradlew clean
```
