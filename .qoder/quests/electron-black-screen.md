# Fix Electron Black Screen in Production Build

## Problem Statement

The Electron application displays a black screen when running as a compiled executable, while working correctly in development mode. The root cause is an incorrect path resolution for the Next.js static export files (`out` directory) in the packaged application.

## Root Cause Analysis

### Current Implementation Issue

In `electron/main.ts` (lines 37-46), the production mode uses:

| Aspect | Current Value | Problem |
|--------|---------------|---------|
| Directory Path | `path.join(__dirname, '../../out')` | `__dirname` resolves incorrectly inside the packaged asar archive |
| Context | When packaged, `__dirname` points to `electron/dist/` inside `app.asar` | The relative path `../../out` cannot find the actual `out` folder location |

### How Electron Packaging Works

| Environment | `__dirname` Location | Path Resolution Result |
|-------------|---------------------|------------------------|
| Development | `<project>/electron/dist/` | `../../out` → `<project>/out/` (Correct) |
| Production (Packaged) | Inside `app.asar` at `electron/dist/` | `../../out` points to invalid location inside asar |

### Package Structure After Build

```
resources/
├── app.asar (contains)
│   ├── electron/dist/main.js    ← __dirname is here
│   ├── electron/dist/preload.js
│   ├── out/                     ← Next.js static files are here
│   │   ├── index.html
│   │   ├── _next/
│   │   └── ...
│   └── package.json
```

## Solution Design

### Approach: Use `app.getAppPath()` for Correct Path Resolution

The fix requires modifying the production path resolution in `electron/main.ts` to use Electron's `app.getAppPath()` API, which correctly resolves to the application root regardless of whether the app is packaged or not.

### File to Modify

| File | Purpose |
|------|---------|
| `electron/main.ts` | Update the `electron-serve` directory configuration |

### Changes Required

#### 1. Update Production Path Resolution

**Location**: `electron/main.ts`, production block (around lines 37-46)

**Current Logic**:
- Uses `path.join(__dirname, '../../out')` which fails in packaged apps

**New Logic**:
- Use `app.getAppPath()` to get the correct application root
- Construct the path to `out` directory from that root

| Scenario | `app.getAppPath()` Returns | Final Path |
|----------|---------------------------|------------|
| Development | `<project-root>` | `<project-root>/out` |
| Production (asar) | Path to `app.asar` | Correctly resolves `out` inside asar |

### Verification Checklist

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run `npm run build` | Next.js generates static files in `out/` directory |
| 2 | Run `npm run build:electron` | TypeScript compiles to `electron/dist/` |
| 3 | Run `npm run electron:build` | Executable is created with bundled resources |
| 4 | Launch the executable | Application renders correctly (no black screen) |

## Additional Considerations

### Ensure `out` Directory is Populated

Before building, verify the Next.js build actually generates output:

| Check | Location | Expected Content |
|-------|----------|------------------|
| Static HTML | `out/index.html` | Entry point HTML file |
| Static Assets | `out/_next/` | JavaScript bundles, CSS, etc. |

The `next.config.ts` is correctly configured with:
- `output: 'export'` - Enables static export
- `distDir: 'out'` - Output directory matches electron-serve expectation
- `trailingSlash: true` - Required for static file serving

### electron-builder Configuration

The current `package.json` build configuration already includes the necessary files:

| Entry | Purpose | Status |
|-------|---------|--------|
| `out/**/*` | Next.js static export | Correctly included |
| `electron/dist/**/*` | Compiled Electron main/preload | Correctly included |

No changes needed to electron-builder configuration.
