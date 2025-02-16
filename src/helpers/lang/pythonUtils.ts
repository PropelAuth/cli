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

export function isInPythonVirtualEnv(): boolean {
    return Boolean(process.env.VIRTUAL_ENV || process.env.CONDA_PREFIX)
}

export async function promptForPythonInstall(packageName: string, spinner?: Spinner): Promise<void> {
    const s = spinner || { start: () => {}, stop: () => {} }
    const inVenv = isInPythonVirtualEnv()

    if (!inVenv) {
        const proceed = await confirm({
            message: pc.yellow(
                `It doesn't look like you're in a Python virtual environment.\n` +
                    `Are you sure you want to install "${packageName}" globally?`
            ),
            active: pc.green('Install globally'),
            inactive: pc.yellow('Skip installation'),
            initialValue: false,
        })

        if (isCancel(proceed)) {
            outro(pc.red('Setup cancelled'))
            process.exit(0)
        }
        if (!proceed) {
            s.stop(pc.yellow(`Skipping Python package installation for "${packageName}"`))
            return
        }
    }

    const choice = await select({
        message: `Install ${pc.green(packageName)} with pip now?`,
        options: [
            { value: 'yes', label: 'Yes, install now' },
            { value: 'skip', label: 'Skip installation' },
        ],
        initialValue: 'yes',
    })

    if (isCancel(choice) || choice === 'skip') {
        s.stop(pc.yellow(`Skipped installing "${packageName}".`))
        return
    }

    s.start(`Installing "${packageName}" with pip...`)
    try {
        await execFileAsync('pip', ['install', packageName])
        s.stop(pc.green(`Successfully installed "${packageName}"`))
    } catch (error) {
        console.error(pc.red('Failed to install package:'), error)
        s.stop(pc.red(`Failed to install "${packageName}". Please install manually.`))
    }
}
