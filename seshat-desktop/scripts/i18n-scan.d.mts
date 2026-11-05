/** Whether a path, written from the root of the repository, holds text a model reads: it is never translated. */
export function isProtectedPath(path: string): boolean

/** Runs `check` or `sync` and returns the exit code: 0 when nothing is left to report, 1 when there is, 2 for a refusal or a bad call. */
export function run(argv: string[], cwd?: string): number
