# Remove Terminal Dependencies Design

## Objective

Remove all terminal-related native dependencies (node-pty and xterm) from the project while preserving the UI structure and overall application functionality. The terminal component will be replaced with a placeholder that maintains visual consistency.

## Background

The project currently integrates a full terminal emulator using:
- `@homebridge/node-pty-prebuilt-multiarch` for backend pseudoterminal functionality
- `xterm` and `xterm-addon-fit` for frontend terminal rendering

These dependencies create build complexity and platform-specific issues. The goal is to remove this functionality while keeping the UI layout intact.

## Scope

### In Scope
- Remove node-pty backend service and all IPC handlers
- Remove xterm frontend components and dependencies
- Replace Terminal component with a non-functional placeholder
- Remove terminal-related configuration from stores
- Clean up package.json dependencies and scripts
- Update Electron configuration to remove native module handling
- Remove terminal type definitions

### Out of Scope
- Modifying other UI components (FileExplorer, EditorArea, ChatPanel, etc.)
- Changing overall application layout
- Altering functionality of non-terminal features

## Impact Analysis

### Files to Modify

| File Path | Changes Required |
|-----------|------------------|
| `electron/pty-service.ts` | Delete entire file |
| `electron/main.ts` | Remove PtyService import, terminal IPC handlers (lines 68-137), and sandbox comment |
| `electron/preload.ts` | Remove terminal object from exposed API (lines 24-33) |
| `electron/electron-env.d.ts` | Remove terminal interface definition (lines 17-22) |
| `app/components/Terminal/Terminal.tsx` | Replace with placeholder component (no xterm) |
| `app/lib/stores/config-store.ts` | Remove terminalFontSize property and setter |
| `app/components/SettingsView.tsx` | Remove terminal font size controls |
| `package.json` | Remove dependencies and npm scripts |

### Dependencies to Remove

#### Runtime Dependencies
- `@homebridge/node-pty-prebuilt-multiarch`
- `xterm`
- `xterm-addon-fit`

#### Development Dependencies
- `electron-rebuild` (only needed for native modules)

#### NPM Scripts to Remove
- `rebuild` script
- `postinstall` script (electron-builder install-app-deps)

### Configuration Changes

#### package.json Build Configuration
Remove native module handling:
- Set `npmRebuild: false` to `true` (or remove, as it's no longer needed)
- Remove `buildDependenciesFromSource: false` (no longer relevant)

#### Electron Main Process
Remove sandbox comment that referenced node-pty requirements.

## Component Design

### Terminal Placeholder Component

The replacement Terminal component will:
- Maintain the same visual dimensions and styling
- Display an informational message indicating terminal is disabled
- Use consistent Vylos theming (black background, green accents)
- Require no external dependencies beyond React

**Component Structure:**
- Single functional component with no refs or effects
- Static JSX with styled message
- Same CSS classes for layout consistency

**Visual Design:**
- Background: `#09090b` (matching original)
- Message color: Light gray for readability
- Optional icon or branding element
- Centered text layout

### Configuration Store Updates

Remove terminal-specific configuration:
- Remove `terminalFontSize` from state interface
- Remove `setTerminalFontSize` action
- Remove default value initialization

Impact: Users who had custom terminal font sizes will lose this preference, but this is acceptable as the feature is being removed.

### Settings UI Updates

Remove terminal configuration section:
- Delete font size adjustment controls
- Update UI to reflect removal (no empty space or broken references)

## Electron Architecture Changes

### IPC Communication

Remove the following IPC channels:
- `terminal:create` (event listener)
- `terminal:write` (event listener)  
- `terminal:resize` (event listener)
- `terminal:data` (emitter)

### Process Communication Flow

Before removal:
```
Renderer (Terminal.tsx) 
  → Preload (terminal API)
    → Main Process (IPC handlers) 
      → PtyService (node-pty wrapper)
```

After removal:
```
Renderer (Terminal.tsx) 
  → Displays static placeholder
  (No backend communication)
```

### Type Safety

Update type definitions to remove terminal API from `window.electron` global interface.

## Build System Changes

### Compilation

Current electron build process includes:
- TypeScript compilation of electron directory
- Native module rebuilding for node-pty

After changes:
- TypeScript compilation remains (for other electron code)
- Native module rebuilding no longer required
- Faster install times without postinstall scripts

### Distribution

electron-builder configuration:
- No longer needs to bundle native node modules
- Reduced package size
- Simplified cross-platform builds

## Risk Assessment

### Low Risk
- Removing unused code paths
- No impact on other features
- Well-isolated changes

### Medium Risk  
- Users expecting terminal functionality will find placeholder
- Settings view changes require UI testing
- Package.json script changes need verification

### Mitigation Strategies
- Clear placeholder message informing users
- Test all remaining functionality after removal
- Verify build process works without native dependencies
- Document change for users if needed

## Migration Strategy

### Development Environment
1. Remove dependencies from package.json
2. Delete or comment out terminal files initially
3. Replace Terminal component with placeholder
4. Remove IPC handlers from main process
5. Test application startup and basic functionality
6. Verify settings view works correctly

### Build Verification
1. Run `npm install` to verify dependency resolution
2. Execute `npm run build:electron` to verify TypeScript compilation
3. Test `electron:dev` script for development workflow
4. Verify `electron:build` produces valid distributable

### Testing Checklist
- Application launches without errors
- File explorer and editor function normally
- Chat and AI features work as expected
- Git integration remains functional
- Settings view displays correctly (without terminal section)
- No console errors related to missing terminal API
- Build process completes successfully

## Success Criteria

1. All terminal dependencies removed from package.json
2. No references to node-pty or xterm in codebase
3. Application compiles and runs without errors
4. UI maintains consistent layout and appearance
5. All non-terminal features function correctly
6. Build process executes faster without native module compilation
7. No TypeScript or runtime errors related to terminal code

## Future Considerations

If terminal functionality is needed in the future:
- Consider web-based terminal solutions (no native dependencies)
- Evaluate command palette approach instead of full terminal
- Implement task runner UI for common operations
- Use external terminal integration rather than embedded- Implement task runner UI for common operations
- Use external terminal integration rather than embedded