import fs from 'fs/promises'
import path from 'path'
import pc from 'picocolors'
import { confirm, outro, text, log } from '@clack/prompts'
import { isCancel } from '@clack/core'
import { readPackageJson } from '../lang/javascriptUtils.js'
import { updateEnvFile } from '../envUtils.js'
import { getApiKey, PropelAuthProject } from '../projectUtils.js'
import { TestEnv } from '../../types/api.js'
import { overwriteFileWithConfirmation } from '../fileUtils.js'
import { Project, SyntaxKind, JsxElement, JsxSelfClosingElement } from 'ts-morph'
import {
    fetchBackendIntegration,
    fetchFrontendIntegration,
    updateFrontendIntegration,
    createApiKey,
} from '../../api.js'

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
        description: 'Your Backend Integration API Key for PropelAuth',
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

export interface PortOrUrl {
    port: number
    url: string
    testEnv: TestEnv
}

export async function getPort(targetPath: string): Promise<PortOrUrl> {
    // Check if the project has a custom port defined
    try {
        const packageJson = await readPackageJson(targetPath)

        // Check for dev script with a port flag
        const devScript = packageJson.scripts?.dev || ''
        const portMatch = devScript.match(/(?:--|:)port\s+(\d+)/)
        if (portMatch) {
            const port = parseInt(portMatch[1], 10)
            const testEnv: TestEnv = {
                type: 'Localhost',
                port,
            }
            return {
                port,
                url: testEnvToUrl(testEnv),
                testEnv,
            }
        }
    } catch (err) {
        // Ignore errors, proceed to user prompt
    }

    // If no port was found automatically, prompt the user to enter one
    const userInput = await text({
        message: 'Enter the URL your Next.js app runs on:',
        initialValue: 'http://localhost:3000',
        placeholder: 'e.g. http://localhost:3000 or https://myapp.com',
    })

    if (isCancel(userInput)) {
        throw new Error('URL selection cancelled')
    }

    const inputStr = userInput.toString().trim()

    // Parse the user input as a URL or port
    const testEnv = urlToTestEnv(inputStr)
    const url = testEnvToUrl(testEnv)

    // Get the port for environment variable configuration
    // For non-localhost URLs, we still need to set up the redirect URI with a port
    let port = 3000
    if (testEnv.type === 'Localhost') {
        port = testEnv.port
    }

    return {
        port,
        url,
        testEnv,
    }
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
    selectedProject: PropelAuthProject,
    s: Spinner,
    portOrUrl?: PortOrUrl
): Promise<void> {
    const apiKey = await getApiKey()
    if (!apiKey) {
        outro('API key not found. Please login first.')
        process.exit(1)
    }

    const beResult = await fetchBackendIntegration(apiKey, selectedProject.orgId, selectedProject.projectId)
    if (!beResult.success) {
        outro(`Could not fetch backend details: ${beResult.error}`)
        process.exit(1)
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
        log.info('No Backend Integration API Key found in environment file')
        const createNew = await confirm({
            message: 'Would you like to generate a new Backend Integration API Key for this project?',
            active: pc.green('yes'),
            inactive: pc.yellow('no'),
        })

        if (isCancel(createNew)) {
            throw new Error('Setup cancelled')
        }

        if (createNew) {
            const keyName = await text({
                message: 'Enter a name for the new Backend Integration API Key:',
                initialValue: 'Next.js Integration',
            })

            if (isCancel(keyName)) {
                throw new Error('API key creation cancelled')
            }

            s.start('Creating new Backend Integration API Key')
            const createKeyResult = await createApiKey(apiKey, selectedProject.orgId, selectedProject.projectId, {
                name: keyName.toString(),
                read_only: false,
            })

            if (!createKeyResult.success) {
                outro(`Could not create Backend Integration API Key: ${createKeyResult.error}`)
                process.exit(1)
            }

            apiKeyValue = createKeyResult.data.api_key
            s.stop('✓ Created new Backend Integration API Key')
        } else {
            log.warn('⚠ No Backend Integration API Key generated. You will need to fill in the PROPELAUTH_API_KEY value manually.')
        }
    }

    // Get the port for the callback URL - using portOrUrl if available
    let redirectUri = 'http://localhost:3000/api/auth/callback'
    if (portOrUrl) {
        if (portOrUrl.testEnv.type === 'Localhost') {
            redirectUri = `http://localhost:${portOrUrl.port}/api/auth/callback`
        }
        // For non-localhost URLs, we keep the default callback URL with port 3000
    }

    const customEnvVars = {
        NEXT_PUBLIC_AUTH_URL: {
            description: 'Your Auth URL',
            required: true,
            value: auth_url_origin,
        },
        PROPELAUTH_API_KEY: {
            description: 'Your Backend Integration API Key for PropelAuth',
            required: true,
            value: apiKeyValue,
        },
        PROPELAUTH_VERIFIER_KEY: {
            description: 'Verifier Key from the dashboard',
            required: true,
            value: formatVerifierKey(verifier_key),
        },
        PROPELAUTH_REDIRECT_URI: {
            description: 'Redirect URI for authentication callbacks',
            required: true,
            value: redirectUri,
        },
    }

    // Update the env file with the fetched values
    await updateEnvFile(envPath, customEnvVars)
}

function formatVerifierKey(verifierKey: string): string {
    return verifierKey.replace(/\n/g, '\\n')
}

/**
 * Converts a TestEnv object to a URL string
 */
export function testEnvToUrl(testEnv: TestEnv): string {
    if (testEnv.type === 'Localhost') {
        return `http://localhost:${testEnv.port}`
    } else if (testEnv.type === 'SchemeAndDomain') {
        return testEnv.scheme_and_domain
    }
    return ''
}

/**
 * Parses a URL string into a TestEnv object
 */
export function urlToTestEnv(url: string): TestEnv {
    try {
        const parsedUrl = new URL(url)

        // Check if it's localhost
        if (parsedUrl.hostname === 'localhost') {
            return {
                type: 'Localhost',
                port: parseInt(parsedUrl.port || '3000', 10),
            }
        }

        // Otherwise, use SchemeAndDomain
        return {
            type: 'SchemeAndDomain',
            scheme_and_domain: url,
        }
    } catch (e) {
        // If URL parsing fails, assume it's just a port number
        const port = parseInt(url, 10)
        if (!isNaN(port)) {
            return {
                type: 'Localhost',
                port,
            }
        }

        // Default to localhost:3000
        return {
            type: 'Localhost',
            port: 3000,
        }
    }
}

export async function configureNextJsRedirectPaths(
    selectedProject: PropelAuthProject,
    s: Spinner,
    portOrUrl: PortOrUrl
): Promise<void> {
    const apiKey = await getApiKey()
    if (!apiKey) {
        outro('API key not found. Please login first.')
        process.exit(1)
    }

    // Fetch current frontend integration details
    const feResult = await fetchFrontendIntegration(apiKey, selectedProject.orgId, selectedProject.projectId)
    if (!feResult.success) {
        outro(`Could not fetch frontend details: ${feResult.error}`)
        process.exit(1)
    }

    const currentSettings = feResult.data.test
    const loginRedirectPath = '/api/auth/callback'
    const logoutRedirectPath = '/api/auth/logout'

    // Check if the current settings match what we want to set
    const currentLoginPath = currentSettings.login_redirect_path
    const currentLogoutPath = currentSettings.logout_redirect_path
    const currentTestEnv = currentSettings.test_env

    // Use the expected TestEnv from portOrUrl
    const expectedTestEnv = portOrUrl.testEnv

    // Convert the test env to a URL for display purposes
    const currentUrl = currentTestEnv ? testEnvToUrl(currentTestEnv) : 'none'
    const expectedUrl = portOrUrl.url

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

    // Compare as URLs for better display
    if (currentUrl !== expectedUrl) {
        needsUpdate = true
        updateMessage += `\n- Development URL: ${pc.red(currentUrl)} → ${pc.green(expectedUrl)}`
    }

    if (needsUpdate) {
        log.info(`Updates needed for the Frontend Integration settings for your test environment\n${updateMessage}`)

        const confirmUpdate = await confirm({
            message: 'Your test environment config needs to be updated, would you like to apply these changes now?',
            active: pc.green('yes'),
            inactive: pc.yellow('no'),
        })

        if (isCancel(confirmUpdate)) {
            throw new Error('Setup cancelled')
        }

        if (!confirmUpdate) {
            // Use log.warn for warning messages
            log.warn('⚠ Settings not updated. You may need to update your PropelAuth dashboard manually.')
            return
        }

        s.start('Updating frontend integration settings')

        // Use the TestEnv from the portOrUrl
        const testEnv = portOrUrl.testEnv

        const updateResult = await updateFrontendIntegration(apiKey, selectedProject.orgId, selectedProject.projectId, {
            test_env: testEnv,
            login_redirect_path: loginRedirectPath,
            logout_redirect_path: logoutRedirectPath,
        })

        if (!updateResult.success) {
            s.stop('Failed to update frontend integration settings')
            outro(`Could not update settings: ${updateResult.error}`)
            process.exit(1)
        }

        s.stop('✓ Updated frontend integration settings')
    } else {
        log.info('✓ Frontend integration settings are already configured correctly')
    }
}

/**
 * Core function to modify a Next.js App Router layout.tsx content
 * to add the AuthProvider wrapper around the children.
 * This function takes a string (file content) and returns the modified string.
 * No file system operations or side effects, making it easy to test.
 */
export function modifyAppRouterLayout(layoutContent: string): {
    modified: boolean
    updatedContent: string
    hasAuthProvider: boolean
} {
    try {
        // Initialize ts-morph project with manipulations format settings
        const project = new Project({
            manipulationSettings: {
                indentationText: '  ' as any, // Two spaces for indentation
                useTrailingCommas: true,
                insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: true,
            },
        })

        // Create a source file from the content string
        const sourceFile = project.createSourceFile('layout.tsx', layoutContent)

        // Check if AuthProvider is already imported
        let hasAuthProviderImport = false
        sourceFile.getImportDeclarations().forEach((importDecl) => {
            if (
                importDecl.getModuleSpecifierValue() === '@propelauth/nextjs/client' &&
                importDecl.getNamedImports().some((named) => named.getName() === 'AuthProvider')
            ) {
                hasAuthProviderImport = true
            }
        })

        // Add import if not present
        if (!hasAuthProviderImport) {
            sourceFile.addImportDeclaration({
                moduleSpecifier: '@propelauth/nextjs/client',
                namedImports: ['AuthProvider'],
            })
        }

        // Find the body tag containing children
        let modified = false
        let bodyElement: JsxElement | undefined

        // Find all JSX elements with tag name 'body'
        sourceFile.forEachDescendant((node) => {
            if (node.getKind() === SyntaxKind.JsxOpeningElement) {
                const tagName = node.getFirstChildByKind(SyntaxKind.Identifier)
                if (tagName && tagName.getText() === 'body') {
                    bodyElement = node.getParent() as JsxElement
                }
            }
        })

        // Check if AuthProvider is already present
        let hasAuthProvider = false

        if (bodyElement) {
            bodyElement.forEachDescendant((node) => {
                if (node.getKind() === SyntaxKind.JsxOpeningElement) {
                    const tagName = node.getFirstChildByKind(SyntaxKind.Identifier)
                    if (tagName && tagName.getText() === 'AuthProvider') {
                        hasAuthProvider = true
                    }
                }
            })

            if (!hasAuthProvider) {
                // Get the body element's children
                const children = bodyElement.getJsxChildren()

                // Analyze the body's structure to find the best place to add the AuthProvider
                const bodyText = bodyElement.getText()
                const matchResult = bodyText.match(/<[^>]+>/g)
                const hasComplexStructure =
                    bodyText.includes('<') && bodyText.includes('>') && matchResult && matchResult.length > 2

                if (hasComplexStructure) {
                    // The body has complex structure, likely with existing providers
                    // Find the innermost content that contains 'children'
                    let innermostChildrenContainer: any = null
                    let deepestLevel = -1

                    const findInnermostChildren = (node: any, level: number) => {
                        if (node.getKind() === SyntaxKind.JsxExpression) {
                            const expression = node.getFirstDescendantByKind(SyntaxKind.Identifier)
                            if (expression && expression.getText() === 'children' && level > deepestLevel) {
                                innermostChildrenContainer = node
                                deepestLevel = level
                            }
                        }
                        node.forEachChild((child: any) => findInnermostChildren(child, level + 1))
                    }

                    bodyElement.forEachChild((child: any) => findInnermostChildren(child, 0))

                    if (innermostChildrenContainer) {
                        // Found the innermost {children} expression, wrap it with a proper JSX structure
                        innermostChildrenContainer.replaceWithText(
                            `<AuthProvider authUrl={process.env.NEXT_PUBLIC_AUTH_URL!}>{children}</AuthProvider>`
                        )
                        modified = true
                    }
                } else {
                    // Find the children expression and replace it with AuthProvider
                    for (let i = 0; i < children.length; i++) {
                        const child = children[i]
                        if (child.getKind() === SyntaxKind.JsxExpression) {
                            const childText = child.getText()
                            if (childText.includes('children')) {
                                // Create a proper JSX structure that will be auto-formatted
                                child.replaceWithText(
                                    `<AuthProvider authUrl={process.env.NEXT_PUBLIC_AUTH_URL!}>{children}</AuthProvider>`
                                )
                                modified = true
                                break
                            }
                        }
                    }
                }
            }
        }

        return {
            modified: modified,
            updatedContent: sourceFile.getFullText(),
            hasAuthProvider: hasAuthProvider || (hasAuthProviderImport && !!bodyElement),
        }
    } catch (error) {
        // If there's an error during parsing or manipulation, return the original content
        console.error('Error modifying App Router layout:', error)
        return {
            modified: false,
            updatedContent: layoutContent,
            hasAuthProvider: false,
        }
    }
}

/**
 * Attempts to automatically modify a Next.js App Router layout.tsx file
 * to add the AuthProvider wrapper around the children.
 */
export async function updateAppRouterLayout(layoutPath: string): Promise<boolean> {
    try {
        // Read the layout file content
        const layoutContent = await fs.readFile(layoutPath, 'utf-8')

        // Use the core function to modify the content
        const result = modifyAppRouterLayout(layoutContent)

        if (result.modified) {
            // Show diff and confirm changes
            await overwriteFileWithConfirmation(
                layoutPath,
                result.updatedContent,
                'Root layout with AuthProvider',
                true
            )
            return true
        } else if (result.hasAuthProvider) {
            return true
        } else {
            return false
        }
    } catch (error) {
        return false
    }
}

/**
 * Core function to modify a Next.js Pages Router _app.tsx content
 * to add the AuthProvider wrapper around the Component.
 * This function takes a string (file content) and returns the modified string.
 * No file system operations or side effects, making it easy to test.
 */
export function modifyPagesRouterApp(appContent: string): {
    modified: boolean
    updatedContent: string
    hasAuthProvider: boolean
} {
    try {
        // Initialize ts-morph project with manipulations format settings
        const project = new Project({
            manipulationSettings: {
                indentationText: '  ' as any, // Two spaces for indentation
                useTrailingCommas: true,
                insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: true,
            },
        })

        // Create a source file from the content string
        const sourceFile = project.createSourceFile('_app.tsx', appContent)

        // Check if AuthProvider is already imported
        let hasAuthProviderImport = false
        sourceFile.getImportDeclarations().forEach((importDecl) => {
            if (
                importDecl.getModuleSpecifierValue() === '@propelauth/nextjs/client' &&
                importDecl.getNamedImports().some((named) => named.getName() === 'AuthProvider')
            ) {
                hasAuthProviderImport = true
            }
        })

        // Add import if not present
        if (!hasAuthProviderImport) {
            sourceFile.addImportDeclaration({
                moduleSpecifier: '@propelauth/nextjs/client',
                namedImports: ['AuthProvider'],
            })
        }

        // Find the App component's return statement
        let modified = false
        const appFunctions = sourceFile.getFunctions().filter((f) => {
            // Look for any exported function, either named 'App', 'MyApp' or any exported function
            return (
                f.getName() === 'App' ||
                f.getName() === 'MyApp' ||
                !!f.getFirstDescendantByKind(SyntaxKind.ExportKeyword) ||
                // Also check if the function is the default export
                sourceFile.getStatements().some((stmt) => {
                    if (stmt.getKind() === SyntaxKind.ExportAssignment) {
                        const exportExpr = (stmt as any).getExpression?.()
                        return exportExpr && exportExpr.getText() === f.getName()
                    }
                    return false
                })
            )
        })

        let hasAuthProvider = false

        if (appFunctions.length > 0) {
            const appFunction = appFunctions[0]
            const returnStatement = appFunction.getFirstDescendantByKind(SyntaxKind.ReturnStatement)

            if (returnStatement) {
                // Check if Component is already wrapped in AuthProvider
                returnStatement.forEachDescendant((node) => {
                    if (node.getKind() === SyntaxKind.JsxOpeningElement) {
                        const tagName = node.getFirstChildByKind(SyntaxKind.Identifier)
                        if (tagName && tagName.getText() === 'AuthProvider') {
                            hasAuthProvider = true
                        }
                    }
                })

                if (!hasAuthProvider) {
                    // Check if return statement has complex structure (likely has other providers)
                    const returnContent = returnStatement.getText().trim()
                    const matchResult = returnContent.match(/<[^>]+>/g)
                    const hasComplexStructure =
                        returnContent.includes('Provider') ||
                        (returnContent.includes('<') &&
                            returnContent.includes('>') &&
                            matchResult &&
                            matchResult.length > 2)

                    if (hasComplexStructure) {
                        // Find the innermost Component reference
                        let innermostComponent: any = null
                        let deepestLevel = -1

                        const findInnermostComponent = (node: any, level: number) => {
                            if (
                                node.getKind() === SyntaxKind.JsxSelfClosingElement ||
                                node.getKind() === SyntaxKind.JsxOpeningElement
                            ) {
                                const tagName = node.getFirstChildByKind(SyntaxKind.Identifier)
                                if (tagName && tagName.getText() === 'Component' && level > deepestLevel) {
                                    innermostComponent =
                                        node.getKind() === SyntaxKind.JsxSelfClosingElement ? node : node.getParent()
                                    deepestLevel = level
                                }
                            }
                            node.forEachChild((child: any) => findInnermostComponent(child, level + 1))
                        }

                        returnStatement.forEachChild((child: any) => findInnermostComponent(child, 0))

                        if (innermostComponent) {
                            // Found the innermost Component, wrap it with proper structure
                            innermostComponent.replaceWithText(
                                `<AuthProvider authUrl={process.env.NEXT_PUBLIC_AUTH_URL!}>${innermostComponent.getText()}</AuthProvider>`
                            )
                            modified = true
                        }
                    } else {
                        // Simple structure, find Component JSX element
                        let componentElement: JsxElement | JsxSelfClosingElement | undefined

                        returnStatement.forEachDescendant((node) => {
                            if (node.getKind() === SyntaxKind.JsxSelfClosingElement) {
                                const tagName = node.getFirstChildByKind(SyntaxKind.Identifier)
                                if (tagName && tagName.getText() === 'Component') {
                                    componentElement = node as JsxSelfClosingElement
                                }
                            } else if (node.getKind() === SyntaxKind.JsxOpeningElement) {
                                const tagName = node.getFirstChildByKind(SyntaxKind.Identifier)
                                if (tagName && tagName.getText() === 'Component') {
                                    componentElement = node.getParent() as JsxElement
                                }
                            }
                        })

                        if (componentElement) {
                            // Use expression structure to let ts-morph handle indentation
                            componentElement.replaceWithText(
                                `<AuthProvider authUrl={process.env.NEXT_PUBLIC_AUTH_URL!}>${componentElement.getText()}</AuthProvider>`
                            )
                            modified = true
                        }
                    }
                }
            }
        }

        return {
            modified: modified,
            updatedContent: sourceFile.getFullText(),
            hasAuthProvider: hasAuthProvider || (hasAuthProviderImport && appFunctions.length > 0),
        }
    } catch (error) {
        // If there's an error during parsing or manipulation, return the original content
        console.error('Error modifying Pages Router app:', error)
        return {
            modified: false,
            updatedContent: appContent,
            hasAuthProvider: false,
        }
    }
}

/**
 * Attempts to automatically modify a Next.js Pages Router _app.tsx file
 * to add the AuthProvider wrapper around the Component.
 */
export async function updatePagesRouterApp(appPath: string, s: Spinner): Promise<boolean> {
    s.start(`Analyzing _app.tsx file at ${pc.cyan(appPath)}`)

    try {
        // Read the app file content
        const appContent = await fs.readFile(appPath, 'utf-8')

        // Use the core function to modify the content
        const result = modifyPagesRouterApp(appContent)

        if (result.modified) {
            // Show diff and confirm changes
            await overwriteFileWithConfirmation(appPath, result.updatedContent, '_app.tsx with AuthProvider', true)
            s.stop(`✓ Updated _app.tsx with AuthProvider`)
            return true
        } else if (result.hasAuthProvider) {
            s.stop(`✓ _app.tsx file already appears to have AuthProvider`)
            return true
        } else {
            s.stop(pc.yellow(`⚠ Could not automatically update _app.tsx file - structure not recognized`))
            return false
        }
    } catch (error) {
        s.stop(pc.yellow(`⚠ Error updating _app.tsx file: ${error}`))
        return false
    }
}

export async function validateNextJsProject(targetPath: string): Promise<{
    nextVersion: string | null
    appRouterDir: string | null
    pagesRouterDir: string | null
    isUsingSrcDir: boolean
}> {
    let nextVersion: string | null = null
    let appRouterDir: string | null = null
    let pagesRouterDir: string | null = null

    try {
        const pkg = await readPackageJson(targetPath)
        nextVersion = pkg.dependencies?.next || pkg.devDependencies?.next || null
        if (!nextVersion) {
            outro(pc.yellow('Next.js not found in package.json'))
            process.exit(1)
        }
    } catch (err) {
        outro(pc.yellow('No package.json found or it was invalid'))
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
    return {
        nextVersion,
        appRouterDir,
        pagesRouterDir,
        isUsingSrcDir,
    }
}
