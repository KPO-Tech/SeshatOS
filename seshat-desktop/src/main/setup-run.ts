/** One thing the first-run setup installs: the model of the titles, the voice, the reading of scanned documents. */
export type SetupTask = { id: string; run: () => Promise<void> }

/**
 * Runs every task at the same time and resolves when the last one has finished. They download different files from different places, so
 * running them one after the other only made the person wait for the sum of the times instead of the longest. A task that fails does not
 * stop the others: onError hears of it, and the rest go on.
 */
export async function runTogether(tasks: SetupTask[], onError: (id: string, error: unknown) => void): Promise<void> {
  await Promise.all(
    tasks.map(async (task) => {
      try {
        await task.run()
      } catch (error) {
        onError(task.id, error)
      }
    })
  )
}
