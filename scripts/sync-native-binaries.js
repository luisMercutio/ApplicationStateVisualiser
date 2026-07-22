// Keeps ONE node_modules usable from both Windows and WSL.
//
// rollup and esbuild ship their native binary as a per-platform optional
// dependency, and npm only installs the one matching the machine that ran
// `npm install`. So a Windows install lacks the Linux binary (and vice versa),
// which breaks `ng serve` when you launch from the other OS.
//
// This runs on postinstall and force-installs the win32 + linux x64 binaries
// for whatever rollup/esbuild versions actually resolved, so both are always
// present. `--force` bypasses npm's EBADPLATFORM check; `--no-save` keeps
// package.json / package-lock.json untouched.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Guard against infinite recursion: the nested `npm install` below can
// re-trigger this postinstall.
if (process.env.SKIP_NATIVE_SYNC) process.exit(0);

function installedVersion(pkg) {
  try {
    const pkgJson = require.resolve(`${pkg}/package.json`, { paths: [process.cwd()] });
    return JSON.parse(fs.readFileSync(pkgJson, 'utf8')).version;
  } catch {
    return null; // not installed (e.g. pruned prod install) — nothing to sync
  }
}

const targets = [];
const rollup = installedVersion('rollup');
if (rollup) {
  targets.push(`@rollup/rollup-win32-x64-msvc@${rollup}`);
  targets.push(`@rollup/rollup-linux-x64-gnu@${rollup}`);
}
const esbuild = installedVersion('esbuild');
if (esbuild) {
  targets.push(`@esbuild/win32-x64@${esbuild}`);
  targets.push(`@esbuild/linux-x64@${esbuild}`);
}

if (targets.length === 0) process.exit(0);

console.log(`[sync-native-binaries] ensuring both-platform binaries: ${targets.join(', ')}`);
try {
  execSync(`npm install --no-save --force ${targets.join(' ')}`, {
    stdio: 'inherit',
    env: { ...process.env, SKIP_NATIVE_SYNC: '1' },
  });
} catch (err) {
  // Non-fatal: the native binary for the *current* platform is already present,
  // so the local build still works; only cross-OS use would be affected.
  console.warn(`[sync-native-binaries] skipped (non-fatal): ${err.message}`);
}
