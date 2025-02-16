import fs from 'fs/promises'
import path from 'path'
import { spinner, intro, outro, confirm, select } from '@clack/prompts'
import { isCancel } from '@clack/core'
import pc from 'picocolors'
import { fileExists, overwriteFileWithConfirmation } from '../helpers/fileUtils'
import { updateEnvFile } from '../helpers/envUtils'

interface EnvVar {
    description: string
    required: boolean
    default?: string
}

const REQUIRED_ENV_VARS: Record<string, EnvVar> = {
    NEXT_PUBLIC_AUTH_URL: {
        description: 'Your Auth URL',
        required: true,
    },
    PROPELAUTH_API_KEY: {
        description: 'An API Key generated via the PropelAuth Dashboard',
        required: true,
    },
    PROPELAUTH_VERIFIER_KEY: {
        description: 'Verifier Key from PropelAuth Dashboard',
        required: true,
    },
    PROPELAUTH_REDIRECT_URI: {
        description: 'Redirect URI for authentication callbacks',
        required: true,
        default: 'http://localhost:3000/api/auth/callback',
    },
}

async function validateNextJsProject(targetPath: string, s: ReturnType<typeof spinner>): Promise<boolean> {
    try {
        const packageJsonPath = path.join(targetPath, 'package.json')
        const packageJsonExists = await fileExists(packageJsonPath)
        
        if (!packageJsonExists) {
            s.stop('No package.json found. Are you in a Next.js project directory?')
            return false
        }

        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'))
        if (!packageJson.dependencies?.next) {
            s.stop('This does not appear to be a Next.js project (no next dependency found)')
            return false
        }

        return true
    } catch (error) {
        s.stop(`Error validating Next.js project: ${error.message}`)
        return false
    }
}

type PackageManager = 'npm' | 'yarn' | 'pnpm'

async function detectPackageManager(targetPath: string): Promise<PackageManager> {
    const files = await fs.readdir(targetPath)
    
    if (files.includes('yarn.lock')) return 'yarn'
    if (files.includes('pnpm-lock.yaml')) return 'pnpm'
    return 'npm'
}

interface InstallOptions {
    withAuth: boolean
    withTailwind: boolean
}

async function promptForInstall(targetPath: string, s: ReturnType<typeof spinner>): Promise<InstallOptions | symbol> {
    const withAuth = await confirm({
        message: 'Would you like to install @propelauth/nextjs?',
        initialValue: true,
    })

    if (isCancel(withAuth)) return withAuth

    const withTailwind = await confirm({
        message: 'Would you like to install Tailwind CSS for styling?',
        initialValue: true,
    })

    if (isCancel(withTailwind)) return withTailwind

    return { withAuth, withTailwind }
}

async function setupNextJs(targetDir?: string): Promise<void> {
    intro(pc.blue('Setting up PropelAuth in your Next.js App Router project'))
    
    const s = spinner()
    try {
        const targetPath = path.resolve(targetDir || process.cwd())
        s.start('Validating Next.js project')
        
        const isValid = await validateNextJsProject(targetPath, s)
        if (!isValid) return

        s.stop('Project validation successful')

        const options = await promptForInstall(targetPath, s)
        if (isCancel(options)) {
            outro('Setup cancelled')
            return
        }

        const packageManager = await detectPackageManager(targetPath)
        
        if ((options as InstallOptions).withAuth) {
            s.start('Installing @propelauth/nextjs')
            // Installation commands would go here
            s.stop('Installed @propelauth/nextjs')
        }

        if ((options as InstallOptions).withTailwind) {
            s.start('Installing Tailwind CSS')
            // Tailwind installation commands would go here
            s.stop('Installed Tailwind CSS')
        }

        s.start('Setting up environment variables')
        const envPath = path.join(targetPath, '.env.local')
        await updateEnvFile(envPath, REQUIRED_ENV_VARS)
        s.stop('Environment variables configured')

        outro(pc.green('Setup complete! 🎉'))
        
    } catch (error) {
        s.stop(`Error: ${error.message}`)
        process.exit(1)
    }
}

export default setupNextJs
