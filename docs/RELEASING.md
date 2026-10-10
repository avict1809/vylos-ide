# Releasing Vylos

How to ship a new version so installed apps pick it up.

**Pushing commits does not update anyone.** Installed apps only look at **GitHub Releases** on [`avict1809/vylos-ide`](https://github.com/avict1809/vylos-ide/releases). A new version reaches users only after you build it, upload it to a release, and publish that release.

> ⚠️ **Every published release is mandatory.** When an installed app finds a newer release, it blocks the whole UI with an "Update Required" screen until the user installs it (see `electron/updater.ts`). Don't publish a release you wouldn't force on every user.

---

## How auto-update works

1. On startup (and every 6 hours after), the packaged app asks GitHub for the **latest release**. It uses `electron-updater` with the `publish` settings in `package.json`.
2. It downloads that release's channel file (`latest-linux.yml` on Linux, `latest.yml` on Windows). If the version there is **higher** than the installed version, it shows the gate and downloads the update in the background.
3. When the download finishes, **Restart & Update** becomes clickable. The app installs the update and reopens.

If any step fails (no release, missing file, offline), the app **stays usable and shows nothing**. This is on purpose so a bad release can't lock users out, but it also means a broken release fails silently. Use the [checks below](#verify-the-release) to confirm the release is correct.

The update check only runs in the **packaged** app. It never runs under `npm run electron:dev`.

---

## One-time setup

1. **Write access** to `avict1809/vylos-ide`. Ask the owner to add you as a collaborator.
2. **A GitHub token** that can create releases:
   - Classic token with the `repo` scope, **or**
   - Fine-grained token for `avict1809/vylos-ide` with **Contents: Read and write**.

   Keep the token out of the repo and out of `.env` files. Export it in the terminal you release from (step 2 below).

---

## Release checklist

### 1. Bump the version

Update the version in `package.json`. It must be **higher** than every version already released, or no one gets the update.

```bash
npm version 0.1.2 --no-git-tag-version   # updates package.json and package-lock.json
git commit -am "0.1.2"
git push
```

Use [semver](https://semver.org): `0.1.2` for fixes, `0.2.0` for features. Never reuse a released version number.

### 2. Build and upload

```bash
export GH_TOKEN=ghp_your_token      # same terminal as the next command
npm run release
```

This builds the Next.js UI and the Electron shell, packages them, and uploads to a GitHub release tagged `v<version>` (for example `v0.1.2`). It creates the release as a **draft** if it doesn't exist.

**The terminal uses a native module, `node-pty`.** Nothing extra is needed on Windows or macOS: it ships prebuilt binaries there. On Linux, `npm install` compiles it, so the build machine needs `g++`, `make` and `python3`. It uses Node's stable ABI (N-API), so it is never rebuilt for Electron (`npmRebuild: false` stays), and `asarUnpack` keeps it outside `app.asar` where it can be loaded. If it ever fails to load, the app still starts: runs fall back to plain output (no typing into programs) and the terminal panel says why.

- **Don't create the release by hand on GitHub first.** electron-builder looks for the tag `v0.1.2`. A hand-made release (especially a tag without the `v`) ends up as a separate, empty release.
- `npm run electron:build` builds locally but **uploads nothing**. Only `npm run release` publishes.
- electron-builder builds only for the OS you run it on. A release made on Linux has only Linux files. For Windows users, also run `npm run release` on a Windows machine with the same version; it adds to the same draft.

### 3. Publish the draft

On the [Releases page](https://github.com/avict1809/vylos-ide/releases), open the `v<version>` draft and check that it has these files:

| Platform | Required files |
|---|---|
| Linux | `latest-linux.yml`, `Vylos-AI-<version>.AppImage`, `vylos_<version>_amd64.deb` |
| Windows | `latest.yml`, the `.exe` installer (plus its `.blockmap` if present) |

Then:
- **Uncheck** "Set as a pre-release".
- **Check** "Set as the latest release".
- Click **Publish release**.

Drafts and pre-releases are **invisible** to installed apps.

### 4. Verify the release

```bash
# 200 plus the new tag. A 404 means there's no usable release (it's still a draft or a pre-release).
curl -s -o /dev/null -w "%{http_code}\n" https://api.github.com/repos/avict1809/vylos-ide/releases/latest
curl -s https://api.github.com/repos/avict1809/vylos-ide/releases/latest | grep '"tag_name"'

# Must print the new version
curl -sL https://github.com/avict1809/vylos-ide/releases/latest/download/latest-linux.yml | head -1
```

Then open an installed copy of the **previous** version. The "Update Required" screen should appear within a few seconds.

---

## Testing an update on your machine

- Install an **older** packaged build, for example keep the previous `Vylos-AI-<old>.AppImage` in `~/Applications/`, and launch that. A dev build never updates.
- On Linux, downloaded updates land in `~/.cache/vylos-updater/pending/`. If the new AppImage is there with the full file size, the download worked and the gate should be showing.
- If the AppImage file name has no version in it (like `Vylos-AI.AppImage`), the update replaces it in place, so desktop launchers keep working.
- To look at the gate UI without releasing anything:

  ```bash
  VYLOS_UPDATE_GATE=demo  npm run electron:dev   # gate mid-download
  VYLOS_UPDATE_GATE=ready npm run electron:dev   # gate ready to install
  ```

---

## Troubleshooting: "I released but the app shows nothing"

| Symptom | Cause | Fix |
|---|---|---|
| `releases/latest` returns **404** | The release is a draft or marked pre-release | Publish it and set it as the latest release (step 3) |
| Release exists but has **no files** | Built with `electron:build`, `GH_TOKEN` wasn't set in that terminal, or the release was made by hand | Run `npm run release` again, or upload the files from `dist/` to the release by hand |
| Files uploaded, still nothing | `package.json` version isn't higher than the installed version | Bump the version and release again |
| Two releases, `0.1.2` and `v0.1.2` | A release was created by hand before running `npm run release` | Keep the `v` release with the files, delete the other one and its tag |
| Works on Linux, not Windows | The release has no Windows files | Run `npm run release` on Windows for the same version |
| Nothing in `~/.cache/vylos-updater/` | The app never reached a valid release, or you're running `electron:dev` | Run the checks in step 4, then launch the **packaged** app |
| Gate appeared but the update didn't install | **Restart & Update** wasn't clicked, or the install was cancelled (the .deb asks for a password) | Reopen the app and click **Restart & Update** |

## Platform notes

- **Linux AppImage:** updates itself in place with no password.
- **Linux .deb:** the update installs through a system password prompt. On distros without `dpkg` (Arch, Garuda), use the AppImage.
- **Windows (NSIS):** `differentialPackage` is off, so every update is a full download.
- **macOS:** auto-update needs a code-signed app, and signing isn't set up yet, so macOS builds won't update themselves.
