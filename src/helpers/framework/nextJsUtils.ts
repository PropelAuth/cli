import fs from 'fs/promises'
import path from 'path'
import pc from 'picocolors'
import { confirm, text } from '@clack/prompts'
import { isCancel } from '@clack/core'
import { readPackageJson } from '../lang/javascriptUtils.js'
import { updateEnvFile } from '../envUtils.js'
import { getApiKey } from '../projectUtils.js'
import { ProjectResponse, TestEnv } from '../../types/api.js'
import { fetchBackendIntegration, fetchFrontendIntegration, updateFrontendIntegration, createApiKey } from '../../api.js'

type Spinner = {
    start: (msg?: string) => void
    stop: (msg?: string) => void
}

export const NEXTJS_REQUIRED_ENV_VARS = {
    NEXT_PUBLIC_AUTH_URL: {
        description: 'Your Auth URL',
        required: true,
        default: '',
    },
    PROPELAUTH_API_KEY: {
        description: 'Your API key for PropelAuth',
        required: true,
    },
    PROPELAUTH_VERIFIER_KEY: {
        description: 'Verifier Key from the dashboard',
        required: true,
    },
    PROPELAUTH_REDIRECT_URI: {
        description: 'Redirect URI for authentication callbacks',
        required: true,
        default: 'http://localhost:3000/api/auth/callback',
    },
}

export async function getPort(targetPath: string): Promise<number> {
    // Check if the project has a custom port defined
    try {
        const packageJsonPath = path.join(targetPath, 'package.json')
        const packageJson = await readPackageJson(targetPath)

        // Check for dev script with a port flag
        const devScript = packageJson.scripts?.dev || ''
        const portMatch = devScript.match(/(?:--|:)port\s+(\d+)/)
        if (portMatch) {
            return parseInt(portMatch[1], 10)
        }
    } catch (err) {
        // Ignore errors, just use the default port
    }

    return 3000 // Default Next.js port
}

export async function parseEnvVars(envContent: string): Promise<Record<string, string>> {
    const envVars: Record<string, string> = {}
    const envLines = envContent.split('\n')
    
    for (const line of envLines) {
        const parts = line.split('=')
        if (parts.length >= 2) {
            const key = parts[0].trim()
            const value = parts.slice(1).join('=').trim()
            envVars[key] = value
        }
    }
    
    return envVars
}

export async function configureNextJsEnvironmentVariables(
    envPath: string,
    selectedProject: ProjectResponse,
    s: Spinner
): Promise<void> {
    s.start('Fetching project configuration from PropelAuth')

    const apiKey = await getApiKey()
    if (!apiKey) {
        s.stop('Failed to get API key')
        throw new Error('API key not found. Please login first.')
    }

    // Fetch backend integration details
    const beResult = await fetchBackendIntegration(apiKey, selectedProject.org_id, selectedProject.project_id)

    if (!beResult.success) {
        s.stop('Failed to fetch backend integration details')
        throw new Error(`Could not fetch backend details: ${beResult.error}`)
    }

    // Set environment variables with fetched values
    const { auth_url_origin, verifier_key } = beResult.data.test

    // Check if an API key environment variable is already set
    let apiKeyValue = ''
    let existingEnvVars: Record<string, string> = {}

    try {
        const envContent = await fs.readFile(envPath, 'utf-8').catch(() => '')
        existingEnvVars = await parseEnvVars(envContent)

        // Check if API key is already set
        if (existingEnvVars['PROPELAUTH_API_KEY']) {
            apiKeyValue = existingEnvVars['PROPELAUTH_API_KEY']
        }
    } catch (err) {
        // If we can't read the file, we'll continue with the normal flow
    }

    // If API key is not already set, ask if they want to generate one
    if (!apiKeyValue) {
        s.stop('No API key found in environment file')
        const createNew = await confirm({
            message: 'Would you like to generate a new API key for this project?',
            active: pc.green('yes'),
            inactive: pc.yellow('no'),
        })

        if (isCancel(createNew)) {
            throw new Error('Setup cancelled')
        }

        if (createNew) {
            const keyName = await text({
                message: 'Enter a name for the new API key:',
                initialValue: 'Next.js Integration',
            })

            if (isCancel(keyName)) {
                throw new Error('API key creation cancelled')
            }

            s.start('Creating new API key')
            const createKeyResult = await createApiKey(apiKey, selectedProject.org_id, selectedProject.project_id, {
                name: keyName.toString(),
                read_only: false,
            })

            if (!createKeyResult.success) {
                s.stop('Failed to create new API key')
                throw new Error(`Could not create API key: ${createKeyResult.error}`)
            }

            apiKeyValue = createKeyResult.data.api_key
            s.stop('✓ Created new API key')
        } else {
            console.log(
                pc.yellow('⚠ No API key generated. You will need to fill in the PROPELAUTH_API_KEY value manually.')
            )
        }
    }

    const customEnvVars = {
        NEXT_PUBLIC_AUTH_URL: {
            description: 'Your Auth URL',
            required: true,
            default: auth_url_origin,
        },
        PROPELAUTH_API_KEY: {
            description: 'Your API key for PropelAuth',
            required: true,
            default: apiKeyValue,
        },
        PROPELAUTH_VERIFIER_KEY: {
            description: 'Verifier Key from the dashboard',
            required: true,
            default: verifier_key,
        },
        PROPELAUTH_REDIRECT_URI: {
            description: 'Redirect URI for authentication callbacks',
            required: true,
            default: 'http://localhost:3000/api/auth/callback',
        },
    }

    s.stop('✓ Fetched integration details')

    // Update the env file with the fetched values
    await updateEnvFile(envPath, customEnvVars, s)
}

export async function configureNextJsRedirectPaths(
    selectedProject: ProjectResponse,
    s: Spinner,
    port: number = 3000
): Promise<void> {
    s.start('Configuring redirect paths')

    const apiKey = await getApiKey()
    if (!apiKey) {
        s.stop('Failed to get API key')
        throw new Error('API key not found. Please login first.')
    }

    // Fetch current frontend integration details
    const feResult = await fetchFrontendIntegration(apiKey, selectedProject.org_id, selectedProject.project_id)

    if (!feResult.success) {
        s.stop('Failed to fetch frontend integration details')
        throw new Error(`Could not fetch frontend details: ${feResult.error}`)
    }

    const currentSettings = feResult.data.test
    const loginRedirectPath = '/api/auth/callback'
    const logoutRedirectPath = '/api/auth/logout'

    // Check if the current settings match what we want to set
    const currentLoginPath = currentSettings.login_redirect_path
    const currentLogoutPath = currentSettings.logout_redirect_path
    const currentPort = currentSettings.test_env?.port || 3000

    let needsUpdate = false
    let updateMessage = ''

    if (currentLoginPath !== loginRedirectPath) {
        needsUpdate = true
        updateMessage += `\n- Login redirect path: ${pc.red(currentLoginPath)} → ${pc.green(loginRedirectPath)}`
    }

    if (currentLogoutPath !== logoutRedirectPath) {
        needsUpdate = true
        updateMessage += `\n- Logout redirect path: ${pc.red(currentLogoutPath)} → ${pc.green(logoutRedirectPath)}`
    }

    if (currentPort !== port) {
        needsUpdate = true
        updateMessage += `\n- Development port: ${pc.red(currentPort.toString())} → ${pc.green(port.toString())}`
    }

    if (needsUpdate) {
        s.stop('Current settings need updating')
        console.log(pc.cyan('The following settings will be updated:') + updateMessage)

        const confirmUpdate = await confirm({
            message: 'Would you like to update these settings?',
            active: pc.green('yes'),
            inactive: pc.yellow('no'),
        })

        if (isCancel(confirmUpdate)) {
            throw new Error('Setup cancelled')
        }

        if (!confirmUpdate) {
            console.log(
                pc.yellow('⚠ Settings not updated. You may need to update your PropelAuth dashboard manually.')
            )
            return
        }

        s.start('Updating frontend integration settings')

        const testEnv: TestEnv = {
            type: 'Localhost',
            port,
        }

        const updateResult = await updateFrontendIntegration(
            apiKey,
            selectedProject.org_id,
            selectedProject.project_id,
            {
                test_env: testEnv,
                login_redirect_path: loginRedirectPath,
                logout_redirect_path: logoutRedirectPath,
                allowed_urls: currentSettings.allowed_urls,
            }
        )

        if (!updateResult.success) {
            s.stop('Failed to update frontend integration settings')
            throw new Error(`Could not update settings: ${updateResult.error}`)
        }

        s.stop('✓ Updated frontend integration settings')
    } else {
        s.stop('✓ Frontend integration settings are already configured correctly')
    }
}

export async function validateNextJsProject(
    targetPath: string,
    s: Spinner
): Promise<{
    nextVersion: string | null
    appRouterDir: string | null
    pagesRouterDir: string | null
    isUsingSrcDir: boolean
}> {
    s.start('Checking for Next.js project details...')

    let nextVersion: string | null = null
    let appRouterDir: string | null = null
    let pagesRouterDir: string | null = null

    try {
        const pkg = await readPackageJson(targetPath)
        nextVersion = pkg.dependencies?.next || pkg.devDependencies?.next || null
        if (!nextVersion) {
            s.stop(pc.yellow('Next.js not found in package.json'))
            process.exit(1)
        }
    } catch (err) {
        s.stop(pc.yellow('No package.json found or it was invalid'))
        process.exit(1)
    }

    const possibleAppDirs = [path.join(targetPath, 'app'), path.join(targetPath, 'src', 'app')]
    const possiblePagesDirs = [path.join(targetPath, 'pages'), path.join(targetPath, 'src', 'pages')]

    for (const dir of possibleAppDirs) {
        try {
            const stats = await fs.stat(dir)
            if (stats.isDirectory()) {
                appRouterDir = dir
                break
            }
        } catch {}
    }

    for (const dir of possiblePagesDirs) {
        try {
            const stats = await fs.stat(dir)
            if (stats.isDirectory()) {
                pagesRouterDir = dir
                break
            }
        } catch {}
    }

    const isUsingSrcDir = !!(appRouterDir?.includes('src') || pagesRouterDir?.includes('src'))

    s.stop(
        `Detected Next.js ${pc.green(nextVersion || '(unknown)')} 
     App Router: ${appRouterDir ? pc.cyan(path.relative(targetPath, appRouterDir)) : pc.yellow('not found')}
     Pages Router: ${pagesRouterDir ? pc.cyan(path.relative(targetPath, pagesRouterDir)) : pc.yellow('not found')}
    `
    )

    return {
        nextVersion,
        appRouterDir,
        pagesRouterDir,
        isUsingSrcDir,
    }
}
