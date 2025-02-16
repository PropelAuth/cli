import fs from 'fs/promises'
import path from 'path'
import { spinner, intro, outro, confirm, select } from '@clack/prompts'
import { isCancel } from '@clack/core'
import pc from 'picocolors'

const REQUIRED_ENV_VARS = {
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

async function updateEnvFile(envPath, s) {
    let existingEnv = new Map()
    let envContent = ''

    try {
        // Try to read existing .env.local
        const content = await fs.readFile(envPath, 'utf-8')
        envContent = content

        // Parse existing variables
        const lines = content.split('\n')
        for (const line of lines) {
            const match = line.match(/^([^=]+)=(.*)$/)
            if (match) {
                existingEnv.set(match[1].trim(), match[2].trim())
            }
        }
    } catch (error) {
        if (error.code !== 'ENOENT') {
            throw error
        }
    }

    // Check for missing required variables
    let missingVars = []
    let updatedContent = envContent

    for (const [key, config] of Object.entries(REQUIRED_ENV_VARS)) {
        if (!existingEnv.has(key)) {
            missingVars.push(key)

            // Add a newline if there's existing content and it doesn't end with one
            if (updatedContent && !updatedContent.endsWith('\n')) {
                updatedContent += '\n'
            }

            // Add comment if this is the first PropelAuth variable
            if (missingVars.length === 1) {
                updatedContent += '\n# PropelAuth Configuration\n'
            }

            // Add the variable with its description
            updatedContent += `# ${config.description}\n`
            updatedContent += `${key}=${config.default || ''}\n`
        }
    }

    if (missingVars.length > 0) {
        s.start('Updating environment variables')
        await fs.writeFile(envPath, updatedContent)
        s.stop(`Updated ${pc.cyan('.env.local')} with ${missingVars.length} new variables`)
    } else {
        s.stop(`${pc.cyan('.env.local')} is already configured`)
    }
}

async function overwriteFileWithConfirmation(filePath, content, description, s) {
    try {
        // Check if file already exists
        const existingContent = await fs.readFile(filePath, 'utf-8')

        if (existingContent === content) {
            s.stop(`${description} already exists with ${pc.green('correct configuration')}`)
            return true
        } else {
            s.stop(`${description} exists with ${pc.yellow('different content')}`)

            const shouldOverwrite = await confirm({
                message: `${description} already exists at ${pc.cyan(filePath)}. Overwrite?`,
            })

            if (isCancel(shouldOverwrite)) {
                outro(pc.red('Setup cancelled'))
                process.exit(0)
            }

            if (shouldOverwrite) {
                s.start(`Updating ${description}`)
                await fs.writeFile(filePath, content)
                s.stop(`Updated ${description}`)
                return true
            } else {
                s.stop(`${pc.yellow('Skipped')} ${description} update`)
                return false
            }
        }
    } catch (error) {
        if (error.code === 'ENOENT') {
            // File doesn't exist, create it
            s.start(`Creating ${description}`)
            await fs.writeFile(filePath, content)
            s.stop(`Created ${description} with ${pc.green('PropelAuth configuration')}`)
            return true
        } else {
            throw error
        }
    }
}

async function validateNextJsProject(targetPath, s) {
    const packageJsonPath = path.join(targetPath, 'package.json')
    try {
        s.start('Checking Next.js project configuration')
        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'))
        const nextVersion = packageJson.dependencies?.next || packageJson.devDependencies?.next

        if (!nextVersion) {
            s.stop(pc.red('Next.js not found in package.json dependencies or devDependencies'))
            throw new Error('Next.js not found in package.json dependencies or devDependencies')
        }

        // Check for app directory location
        const possibleAppDirs = [path.join(targetPath, 'app'), path.join(targetPath, 'src', 'app')]

        let appDirPath = null
        for (const dir of possibleAppDirs) {
            try {
                const stats = await fs.stat(dir)
                if (stats.isDirectory()) {
                    appDirPath = dir
                    break
                }
            } catch (error) {
                // Directory doesn't exist, continue checking
                continue
            }
        }

        if (!appDirPath) {
            s.stop(pc.red('App directory not found'))
            throw new Error('Could not find app directory. Are you using the App Router?')
        }

        const isUsingSrcDir = appDirPath.includes('src')
        s.stop(
            `Found ${pc.green(`Next.js ${nextVersion}`)} project using ${pc.cyan(path.relative(targetPath, appDirPath))}`
        )

        return {
            nextVersion,
            appDirPath,
            isUsingSrcDir,
        }
    } catch (error) {
        if (error.code === 'ENOENT') {
            s.stop(pc.red('package.json not found'))
            throw new Error('package.json not found. Please run this command in a Next.js project directory.')
        }
        throw error
    }
}

async function detectPackageManager(targetPath) {
    const files = await fs.readdir(targetPath)

    // Check for lockfiles and config files
    const hasNpmLock = files.includes('package-lock.json')
    const hasYarnLock = files.includes('yarn.lock')
    const hasPnpmLock = files.includes('pnpm-lock.yaml')
    const hasBunLock = files.includes('bun.lockb')

    if (hasNpmLock) {
        return 'npm'
    }
    if (hasYarnLock) {
        return 'yarn'
    }
    if (hasPnpmLock) {
        return 'pnpm'
    }
    if (hasBunLock) {
        return 'bun'
    }

    return null
}

async function promptForInstall(targetPath, s) {
    const detectedPM = await detectPackageManager(targetPath)

    const options = [
        {
            value: 'npm',
            label: 'npm install',
            hint: detectedPM === 'npm' ? 'detected' : undefined,
        },
        {
            value: 'yarn',
            label: 'yarn',
            hint: detectedPM === 'yarn' ? 'detected' : undefined,
        },
        {
            value: 'pnpm',
            label: 'pnpm install',
            hint: detectedPM === 'pnpm' ? 'detected' : undefined,
        },
        {
            value: 'bun',
            label: 'bun install',
            hint: detectedPM === 'bun' ? 'detected' : undefined,
        },
        {
            value: 'skip',
            label: 'Skip installation',
            hint: 'install dependencies later',
        },
    ]

    // Move detected package manager to top if found
    if (detectedPM) {
        const detectedIndex = options.findIndex((opt) => opt.value === detectedPM)
        const [detected] = options.splice(detectedIndex, 1)
        options.unshift(detected)
    }

    const choice = await select({
        message: `Install ${pc.green('@propelauth/nextjs')} now?`,
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
        const { execFile } = await import('child_process')
        const { promisify } = await import('util')
        const execFileAsync = promisify(execFile)

        const args = choice === 'yarn' ? ['add', '@propelauth/nextjs'] : ['install', '@propelauth/nextjs']

        await execFileAsync(choice, args, { cwd: targetPath })
        s.stop(pc.green('Dependency installed successfully'))
    } catch (error) {
        console.error(error)
        s.stop(pc.red('Failed to install dependency'))
        outro(
            pc.yellow(
                `Please run ${pc.green(choice + ' ' + (choice === 'yarn' ? 'add' : 'install') + '@propelauth/nextjs')} manually`
            )
        )
    }
}

async function setupNextJs(targetDir) {
    intro(pc.cyan('Setting up PropelAuth in Next.js App Router project'))
    const targetPath = path.resolve(process.cwd(), targetDir || '.')

    try {
        const s = spinner()

        // Validate the Next.js project first
        const { nextVersion, appDirPath, isUsingSrcDir } = await validateNextJsProject(targetPath, s)

        // Then install the package
        await promptForInstall(targetPath, s)

        // Update .env.local with any missing variables
        const envPath = path.join(targetPath, '.env.local')
        await updateEnvFile(envPath, s)

        // Create necessary directories
        const authApiDir = path.join(appDirPath, 'api', 'auth', '[slug]')
        s.start('Creating authentication routes directory')
        await fs.mkdir(authApiDir, { recursive: true })
        s.stop('Created authentication routes directory')

        // Check Next.js version for async handlers
        const nextMajorVersion = parseInt(nextVersion.match(/^(\d+)/)[1], 10)
        const useAsyncHandlers = nextMajorVersion >= 15

        // Create route.ts
        const routeFilePath = path.join(authApiDir, 'route.ts')
        const routeContent = `// app/api/auth/[slug]/route.ts
import {getRouteHandlers} from "@propelauth/nextjs/server/app-router";
import {NextRequest} from "next/server";

const routeHandlers = getRouteHandlers({
    postLoginRedirectPathFn: (req: NextRequest) => {
        return "/"
    }
})
export const GET = routeHandlers.${useAsyncHandlers ? 'getRouteHandlerAsync' : 'getRouteHandler'}
export const POST = routeHandlers.${useAsyncHandlers ? 'postRouteHandlerAsync' : 'postRouteHandler'}
`

        await overwriteFileWithConfirmation(routeFilePath, routeContent, 'route.ts', s)

        // Create middleware.ts
        const middlewareContent = `import {authMiddleware} from "@propelauth/nextjs/server/app-router";

export const middleware = authMiddleware

export const config = {
    matcher: [
        // REQUIRED: Match all request paths that start with /api/auth/
        '/api/auth/(.*)',
        // OPTIONAL: Don't match any static assets
        '/((?!_next/static|_next/image|favicon.ico).*)',
    ],
}
`
        const middlewarePath = path.join(targetPath, isUsingSrcDir ? 'src/middleware.ts' : 'middleware.ts')
        await overwriteFileWithConfirmation(middlewarePath, middlewareContent, 'middleware.ts', s)

        // Update layout.tsx with AuthProvider
        const layoutPath = path.join(appDirPath, 'layout.tsx')

        s.start('Checking root layout configuration')
        try {
            const existingLayout = await fs.readFile(layoutPath, 'utf-8')
            s.stop('Found root layout')

            outro(`
${pc.cyan('Root Layout Changes Required:')}

1. Add this import at the top of ${pc.cyan(layoutPath)}:
   ${pc.green('import { AuthProvider } from "@propelauth/nextjs/client";')}

2. Wrap your ${pc.yellow('{children}')} element with AuthProvider:

   ${pc.dim('Before:')}
   ${pc.dim('-------')}
   ${pc.yellow('<html lang="en">')}
     ${pc.yellow('<body>{children}</body>')}
   ${pc.yellow('</html>')}

   ${pc.dim('After:')}
   ${pc.dim('------')}
   ${pc.yellow('<html lang="en">')}
     ${pc.green('<AuthProvider authUrl={process.env.NEXT_PUBLIC_AUTH_URL!}>')}
       ${pc.yellow('<body>{children}</body>')}
     ${pc.green('</AuthProvider>')}
   ${pc.yellow('</html>')}
`)

            const answer = await confirm({
                message: 'Have you made these changes to your root layout?',
                active: pc.green('yes'),
                inactive: pc.yellow('no'),
                initialValue: false,
            })

            if (isCancel(answer)) {
                outro(pc.red('Setup cancelled'))
                process.exit(0)
            }

            if (!answer) {
                const skipAnswer = await confirm({
                    message: 'Would you like to skip this step?',
                    active: pc.yellow('yes'),
                    inactive: pc.green('no'),
                    initialValue: false,
                })

                if (isCancel(skipAnswer)) {
                    outro(pc.red('Setup cancelled'))
                    process.exit(0)
                }

                if (!skipAnswer) {
                    outro(pc.yellow('Please make the required changes to your root layout and run this command again'))
                    process.exit(1)
                }

                s.start('Skipping root layout configuration')
                s.stop(pc.yellow('Root layout configuration skipped'))
            } else {
                s.start('Continuing with root layout configured')
                s.stop(pc.green('Root layout configured'))
            }
        } catch (error) {
            if (error.code === 'ENOENT') {
                s.stop(pc.red('Root layout not found'))
                throw new Error(
                    'Root layout (layout.tsx) not found. Please ensure you have a root layout file in your app directory.'
                )
            }
            throw error
        }

        outro(pc.green('PropelAuth setup completed!'))
        // TODO: the .env.local file should pull from an API
        // TODO: it should also update the default redirect paths via an API
        outro(`${pc.cyan('Next steps:')}
1. Fill in your environment variables in ${pc.cyan('.env.local')}
2. Configure your PropelAuth Dashboard:
   - Set Default redirect path after login to: ${pc.green('/api/auth/callback')}
   - Set Default redirect path after logout to: ${pc.green('/api/auth/logout')}`)
    } catch (error) {
        outro(pc.red(`Error: ${error.message}`))
        process.exit(1)
    }
}

export default setupNextJs
