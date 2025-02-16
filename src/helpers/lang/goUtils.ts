import fs from 'fs/promises'
import path from 'path'
import pc from 'picocolors'
import { confirm, select, outro } from '@clack/prompts'
import { isCancel } from '@clack/core'
import { execFile } from 'child_process'
import { promisify } from 'util'
const execFileAsync = promisify(execFile)

type Spinner = {
    start: (msg?: string) => void
    stop: (msg?: string) => void
}

export async function isGoProject(targetPath: string): Promise<boolean> {
    try {
        const files = await fs.readdir(targetPath)
        return files.includes('go.mod')
    } catch {
        return false
    }
}

export async function promptForGoInstall(
    targetPath: string,
    packageName: string,
    spinner?: Spinner,
    globalInstall: boolean = false
): Promise<void> {
    const s = spinner || { start: () => {}, stop: () => {} }
    const inGo = await isGoProject(targetPath)

    if (!inGo && !globalInstall) {
        const proceed = await confirm({
            message: pc.yellow(
                `It doesn't look like there's a go.mod file in ${targetPath}.\n` +
                    `Are you sure you want to install "${packageName}" in this directory?`
            ),
            active: pc.green('Proceed'),
            inactive: pc.yellow('Skip'),
            initialValue: false,
        })

        if (isCancel(proceed)) {
            outro(pc.red('Setup cancelled'))
            process.exit(0)
        }
        if (!proceed) {
            s.stop(pc.yellow(`Skipping Go installation of "${packageName}"`))
            return
        }
    }

    const choice = await select({
        message: `Install ${pc.green(packageName)} via Go?`,
        options: [
            { value: 'yes', label: 'Yes, install now' },
            { value: 'skip', label: 'Skip' },
        ],
        initialValue: 'yes',
    })

    if (isCancel(choice) || choice === 'skip') {
        s.stop(pc.yellow(`Skipped installing "${packageName}".`))
        return
    }

    s.start(`Installing ${packageName}...`)
    try {
        if (globalInstall) {
            await execFileAsync('go', ['install', `${packageName}@latest`], { cwd: targetPath })
        } else {
            await execFileAsync('go', ['get', packageName], { cwd: targetPath })
        }
        s.stop(pc.green(`Go package "${packageName}" installed successfully.`))
    } catch (err) {
        console.error(err)
        s.stop(pc.red(`Failed to install "${packageName}"`))
        outro(pc.yellow(`Please run "go ${globalInstall ? 'install' : 'get'} ${packageName}" manually.`))
    }
}
