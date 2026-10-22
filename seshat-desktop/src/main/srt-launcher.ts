// The files that start the packaged srt with Electron's own Node, so the user does not need Node installed.
//
// srt's command line is built with commander. In Electron's Node mode (ELECTRON_RUN_AS_NODE) commander sees `process.versions.electron`
// and reads the arguments as a packaged Electron app's: it does not skip the script, because `process.defaultApp` is not set. The path of
// the script then became the first argument, which srt took for the command to run in the sandbox:
//
//   Original command: 'D:\...\cli.js' cmd /C exit 0     ->  "The filename, directory name, or volume label syntax is incorrect."
//
// so every confined command failed, and the confinement probe always said the sandbox was unavailable. An entry script sets
// `process.defaultApp` before loading the CLI, which makes commander skip the script as it does under `electron .`.

/** The script the launcher runs: it marks the process as a default app, then loads srt's CLI. */
export function srtEntryScript(cliPath: string): string {
  return [
    "// Electron's Node mode leaves process.defaultApp unset, and commander then counts this script's path as the first argument.",
    'process.defaultApp = true',
    `import(require('node:url').pathToFileURL(${JSON.stringify(cliPath)}).href).catch((error) => {`,
    '  console.error(error)',
    '  process.exit(1)',
    '})',
    ''
  ].join('\n')
}

/** The Windows launcher. A .cmd file: its lines end with CRLF, and the arguments are passed on as they came. */
export function srtWindowsLauncher(execPath: string, entryPath: string): string {
  return `@echo off\r\nset ELECTRON_RUN_AS_NODE=1\r\n"${execPath}" "${entryPath}" %*\r\n`
}

/** The macOS launcher. */
export function srtUnixLauncher(execPath: string, entryPath: string): string {
  return `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec "${execPath}" "${entryPath}" "$@"\n`
}
