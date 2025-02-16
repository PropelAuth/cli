import fs from 'fs/promises'
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

export async function isRustProject(targetPath: string): Promise<boolean> {
    try {
        const files = await fs.readdir(targetPath)
        return files.includes('Cargo.toml')
    } catch {
        return false
    }
}

export async function promptForRustInstall(
    targetPath: string,
    crateName: string,
    spinner?: Spinner,
    installBinary: boolean = false
): Promise<void> {
    const s = spinner || { start: () => {}, stop: () => {} }
    const inRust = await isRustProject(targetPath)

    if (!inRust && !installBinary) {
        const proceed = await confirm({
            message: pc.yellow(
                `It doesn't look like there's a Cargo.toml in ${targetPath}.\n` +
                    `Are you sure you want to add "${crateName}"? Perhaps it's a binary install?`
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
            s.stop(pc.yellow(`Skipping Rust crate installation of "${crateName}"`))
            return
        }
    }

    const method = installBinary ? 'cargo install' : 'cargo add'
    const choice = await select({
        message: `Use ${method} ${pc.green(crateName)} now?`,
        options: [
            { value: 'yes', label: `Yes, run "${method}" now` },
            { value: 'skip', label: 'Skip' },
        ],
        initialValue: 'yes',
    })

    if (isCancel(choice) || choice === 'skip') {
        s.stop(pc.yellow(`Skipped installing "${crateName}".`))
        return
    }

    s.start(`Installing "${crateName}" with ${method}`)
    try {
        if (installBinary) {
            await execFileAsync('cargo', ['install', crateName], { cwd: targetPath })
        } else {
            await execFileAsync('cargo', ['add', crateName], { cwd: targetPath })
        }
        s.stop(pc.green(`"${crateName}" installed successfully.`))
    } catch (error) {
        console.error(error)
        s.stop(pc.red(`Failed to run "${method} ${crateName}".`))
        outro(pc.yellow(`Please run "${method} ${crateName}" manually.`))
    }
}
