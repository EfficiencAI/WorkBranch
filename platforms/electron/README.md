# @workbranch/electron

Electron desktop application for WorkBranch.

## Development

```bash
# Start development mode
pnpm dev:electron

# Build for Windows
pnpm build:electron
```

## Architecture

```
src/
├── main/       # Main process (Node.js)
│   └── index.ts
└── preload/    # Preload scripts (bridge to renderer)
    └── index.ts
```

## Build Output

- `release/` - Contains built installers
  - NSIS installer (.exe)
  - Portable version (.exe)
