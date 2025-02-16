import fs from 'fs/promises'
import path from 'path'
import pc from 'picocolors'
import { select, outro } from '@clack/prompts'
import { isCancel } from '@clack/core'
import { execFile } from 'child_process'
import { promisify } from 'util'
const execFileAsync = promisify(execFile)

type Spinner = {
    start: (msg?: string) => void
    stop: (msg?: string) => void
}

export async function readPackageJson(targetPath: string): Promise<Record<string, any>> {
    const packageJsonPath = path.join(targetPath, 'package.json')
    const data = await fs.readFile(packageJsonPath, 'utf8')
    return JSON.parse(data)
}

export async function detectPackageManager(targetPath: string): Promise<'npm' | 'yarn' | 'pnpm' | 'bun' | null> {
    const files = await fs.readdir(targetPath)
    if (files.includes('package-lock.json')) return 'npm'
    if (files.includes('yarn.lock')) return 'yarn'
    if (files.includes('pnpm-lock.yaml')) return 'pnpm'
    if (files.includes('bun.lockb')) return 'bun'
    return null
}

export async function promptForJsInstall(
    targetPath: string,
    spinner: Spinner | undefined,
    packageName: string
): Promise<void> {
    const s = spinner || { start: () => {}, stop: () => {} }
    const detectedPM = await detectPackageManager(targetPath)

    const options = [
        {
            value: 'npm',
            label: `npm install ${packageName}`,
            hint: detectedPM === 'npm' ? 'detected' : undefined,
        },
        {
            value: 'yarn',
            label: `yarn add ${packageName}`,
            hint: detectedPM === 'yarn' ? 'detected' : undefined,
        },
        {
            value: 'pnpm',
            label: `pnpm install ${packageName}`,
            hint: detectedPM === 'pnpm' ? 'detected' : undefined,
        },
        {
            value: 'bun',
            label: `bun install ${packageName}`,
            hint: detectedPM === 'bun' ? 'detected' : undefined,
        },
        {
            value: 'skip',
            label: 'Skip installation',
            hint: 'Install dependencies later',
        },
    ]

    if (detectedPM) {
        const i = options.findIndex((o) => o.value === detectedPM)
        if (i >= 0) {
            const [detected] = options.splice(i, 1)
            options.unshift(detected)
        }
    }

    const choice = await select({
        message: `Install ${pc.green(packageName)} now?`,
        options,
        initialValue: detectedPM || 'npm',
    })

    if (isCancel(choice)) {
        outro(pc.red('Setup cancelled'))
        process.exit(0)
    }

    if (choice === 'skip') {
        s.stop('Skipped dependency installation')
        return
    }

    s.start(`Installing dependencies with ${choice}`)
    try {
        let args: string[] = []
        if (choice === 'yarn') {
            args = ['add', packageName]
        } else {
            args = ['install', packageName]
        }
        await execFileAsync(choice, args, { cwd: targetPath })
        s.stop(pc.green(`Dependency ${packageName} installed successfully`))
    } catch (err) {
        console.error(err)
        s.stop(pc.red(`Failed to install ${packageName}`))
        outro(
            pc.yellow(
                `Please run ${pc.green(choice + ' ' + (choice === 'yarn' ? 'add ' : 'install ') + packageName)} manually`
            )
        )
    }
}
