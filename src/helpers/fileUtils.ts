import fs from 'fs/promises'
import path from 'path'
import pc from 'picocolors'
import { confirm, log, outro } from '@clack/prompts'
import { isCancel } from '@clack/core'
import untildify from 'untildify'

type Spinner = {
    start: (msg?: string) => void
    stop: (msg?: string) => void
}

/**
 * Resolves a path that can be absolute, relative, or start with ~
 * - Absolute paths are returned as-is
 * - Relative paths are resolved relative to process.cwd()
 * - Paths starting with ~ are resolved relative to the user's home directory
 */
export function resolvePath(inputPath: string | undefined): string {
    if (!inputPath) {
        return process.cwd()
    }

    return path.resolve(untildify(inputPath))
}

export async function ensureDirectory(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true })
}

export async function readFileSafe(filePath: string): Promise<string | null> {
    try {
        return await fs.readFile(filePath, 'utf-8')
    } catch (err: any) {
        if (err.code === 'ENOENT') return null
        throw err
    }
}

export async function loadResource(resourcePath: string): Promise<string> {
    return fs.readFile(resourcePath, 'utf-8')
}

export async function overwriteFileWithConfirmation(
    filePath: string,
    newContent: string,
    description: string,
    showDiff: boolean = true
): Promise<void> {
    const existingContent = await readFileSafe(filePath)

    if (existingContent === null) {
        await fs.writeFile(filePath, newContent)
        return
    }

    if (existingContent === newContent) {
        return
    }

    if (showDiff) {
        // Import showLayoutChangeDiff function
        const { showLayoutChangeDiff } = await import('./showLayoutChangeDiff.js')
        log.info(pc.magenta('--- DIFF ---------------------------------------------------------'))
        showLayoutChangeDiff((msg) => log.info(msg), existingContent, newContent)
        log.info(pc.magenta('------------------------------------------------------------------'))
    }

    log.info(`${description} at ${pc.cyan(filePath)} differs from what we expected.`)

    const shouldOverwrite = await confirm({
        message: `Overwrite ${description}?`,
        active: pc.green('Yes'),
        inactive: pc.yellow('No'),
        initialValue: false,
    })

    if (isCancel(shouldOverwrite)) {
        outro(pc.red('Setup cancelled'))
        process.exit(0)
    }

    if (shouldOverwrite) {
        await fs.writeFile(filePath, newContent)
    }
}
