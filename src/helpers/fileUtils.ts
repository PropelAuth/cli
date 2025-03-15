import fs from 'fs/promises'
import path from 'path'
import pc from 'picocolors'
import { confirm, log, outro } from '@clack/prompts'
import { isCancel } from '@clack/core'
import { createTwoFilesPatch } from 'diff'
import os from 'os'
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

export async function ensureDirectory(dirPath: string, spinner?: Spinner): Promise<void> {
    const s = spinner || { start: () => {}, stop: () => {} }
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
    spinner?: Spinner,
    showDiff: boolean = true
): Promise<void> {
    const s = spinner || { start: () => {}, stop: () => {} }
    const existingContent = await readFileSafe(filePath)

    if (existingContent === null) {
        s.start(`Creating ${description} at ${pc.cyan(filePath)}`)
        await fs.writeFile(filePath, newContent)
        s.stop(`Created ${description}`)
        return
    }

    if (existingContent === newContent) {
        s.stop(`${description} is already up to date at ${pc.cyan(filePath)}`)
        return
    }

    if (showDiff) {
        // Import showLayoutChangeDiff function
        const { showLayoutChangeDiff } = await import('./showLayoutChangeDiff.js')
        log.info(pc.magenta('--- DIFF ---------------------------------------------------------'))
        showLayoutChangeDiff(
            (msg) => log.info(msg),
            existingContent,
            newContent
        )
        log.info(pc.magenta('------------------------------------------------------------------'))
    }

    s.stop(`${description} at ${pc.cyan(filePath)} differs from what we expected.`)

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
        s.start(`Overwriting ${description}`)
        await fs.writeFile(filePath, newContent)
        s.stop(`Updated ${description}`)
    } else {
        s.stop(pc.yellow(`Skipped overwrite for ${description}`))
    }
}
