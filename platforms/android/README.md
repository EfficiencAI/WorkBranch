# @workbranch/android

Android application for WorkBranch using Capacitor.

## Prerequisites

- Android Studio installed
- Android SDK configured
- Gradle build system

## Development

```bash
# Sync web assets to Android project
pnpm --filter @workbranch/android run sync

# Open in Android Studio
pnpm --filter @workbranch/android run open

# Build APK
pnpm --filter @workbranch/android run build

# Run on connected device
pnpm --filter @workbranch/android run run
```

## Architecture

```
app/src/main/
├── java/com/workbranch/app/
│   ├── MainActivity.java    # Main activity
│   ├── MainApplication.java # Application class
│   └── NodeService.java     # Node.js backend service
├── res/
│   └── values/
│       └── strings.xml      # App strings
└── AndroidManifest.xml      # Manifest
```

## Node.js Backend Integration

The app uses `nodejs-mobile` to run the Node.js backend on Android.

### Setup

1. Add nodejs-mobile dependency to build.gradle
2. Place backend bundle in assets
3. NodeService starts the backend on app launch

## Build Output

- `app/build/outputs/apk/` - Contains built APK files
