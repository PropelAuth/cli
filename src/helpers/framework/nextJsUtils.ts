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
    selectedProject: PropelAuthProject,
    s: Spinner
): Promise<void> {
    s.start('Fetching project configuration from PropelAuth')

    const apiKey = await getApiKey()
    if (!apiKey) {
        s.stop('Failed to get API key')
        throw new Error('API key not found. Please login first.')
    }

    // Fetch backend integration details
    const beResult = await fetchBackendIntegration(apiKey, selectedProject.orgId, selectedProject.projectId)

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
            const createKeyResult = await createApiKey(apiKey, selectedProject.orgId, selectedProject.projectId, {
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
            log.warn('⚠ No API key generated. You will need to fill in the PROPELAUTH_API_KEY value manually.')
        }
    }

    const customEnvVars = {
        NEXT_PUBLIC_AUTH_URL: {
            description: 'Your Auth URL',
            required: true,
            value: auth_url_origin,
        },
        PROPELAUTH_API_KEY: {
            description: 'Your API key for PropelAuth',
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
            value: 'http://localhost:3000/api/auth/callback',
        },
    }

    // Update the env file with the fetched values
    await updateEnvFile(envPath, customEnvVars)
}

function formatVerifierKey(verifierKey: string): string {
    return verifierKey.replace(/\n/g, '\\n')
}

export async function configureNextJsRedirectPaths(
    selectedProject: PropelAuthProject,
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
    const feResult = await fetchFrontendIntegration(apiKey, selectedProject.orgId, selectedProject.projectId)

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
        s.stop('Settings need updating')

        const confirmUpdate = await confirm({
            message: 'Would you like to update these settings?',
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

        const testEnv: TestEnv = {
            type: 'Localhost',
            port,
        }

        const updateResult = await updateFrontendIntegration(apiKey, selectedProject.orgId, selectedProject.projectId, {
            test_env: testEnv,
            login_redirect_path: loginRedirectPath,
            logout_redirect_path: logoutRedirectPath,
            allowed_urls: currentSettings.allowed_urls,
        })

        if (!updateResult.success) {
            s.stop('Failed to update frontend integration settings')
            throw new Error(`Could not update settings: ${updateResult.error}`)
        }

        s.stop('✓ Updated frontend integration settings')
    } else {
        s.stop('✓ Frontend integration settings are already configured correctly')
    }
}

/**
 * Attempts to automatically modify a Next.js App Router layout.tsx file 
 * to add the AuthProvider wrapper around the children.
 */
export async function updateAppRouterLayout(
    layoutPath: string, 
    s: Spinner
): Promise<boolean> {
    s.start(`Analyzing layout file at ${pc.cyan(layoutPath)}`)
    
    try {
        // Initialize ts-morph project with manipulations format settings
        const project = new Project({
            manipulationSettings: {
                indentationText: "  " as any, // Two spaces for indentation
                useTrailingCommas: true,
                insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: true,
            }
        })
        const sourceFile = project.addSourceFileAtPath(layoutPath)
        
        // Check if AuthProvider is already imported
        let hasAuthProviderImport = false
        sourceFile.getImportDeclarations().forEach(importDecl => {
            if (importDecl.getModuleSpecifierValue() === '@propelauth/nextjs/client' &&
                importDecl.getNamedImports().some(named => named.getName() === 'AuthProvider')) {
                hasAuthProviderImport = true
            }
        })
        
        // Add import if not present
        if (!hasAuthProviderImport) {
            sourceFile.addImportDeclaration({
                moduleSpecifier: '@propelauth/nextjs/client',
                namedImports: ['AuthProvider']
            })
        }
        
        // Find the body tag containing children
        let modified = false
        let bodyElement: JsxElement | undefined
        
        // Find all JSX elements with tag name 'body'
        sourceFile.forEachDescendant(node => {
            if (node.getKind() === SyntaxKind.JsxOpeningElement) {
                const tagName = node.getFirstChildByKind(SyntaxKind.Identifier)
                if (tagName && tagName.getText() === 'body') {
                    bodyElement = node.getParent() as JsxElement
                }
            }
        })
        
        if (bodyElement) {
            // Check if children is already wrapped in AuthProvider
            let hasAuthProvider = false
            bodyElement.forEachDescendant(node => {
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
                const hasComplexStructure = bodyText.includes('<') && bodyText.includes('>') && 
                    matchResult && matchResult.length > 2
                
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
                        const childrenIdentifier = innermostChildrenContainer.getFirstDescendantByKind(SyntaxKind.Identifier)
                        
                        // Create a wrapper around children using proper structure
                        innermostChildrenContainer.replaceWithText(`<AuthProvider authUrl={process.env.NEXT_PUBLIC_AUTH_URL!}>{children}</AuthProvider>`)
                        modified = true
                    } else {
                        // No {children} found, which is odd but possible
                        s.stop(pc.yellow(`⚠ Could not locate children in the body element`))
                        return false
                    }
                } else {
                    // Find the children expression and replace it with AuthProvider
                    for (let i = 0; i < children.length; i++) {
                        const child = children[i]
                        if (child.getKind() === SyntaxKind.JsxExpression) {
                            const childText = child.getText()
                            if (childText.includes('children')) {
                                // Create a proper JSX structure that will be auto-formatted
                                child.replaceWithText(`<AuthProvider authUrl={process.env.NEXT_PUBLIC_AUTH_URL!}>{children}</AuthProvider>`)
                                modified = true
                                break
                            }
                        }
                    }
                }
            }
        }
        
        if (modified) {
            // Get the modified source text
            const updatedCode = sourceFile.getFullText()
            
            // Show diff and confirm changes
            await overwriteFileWithConfirmation(
                layoutPath,
                updatedCode,
                'Root layout with AuthProvider',
                s,
                true
            )
            s.stop(`✓ Updated layout.tsx with AuthProvider`)
            return true
        } else if (hasAuthProviderImport && bodyElement) {
            s.stop(`✓ Layout file already appears to have AuthProvider`)
            return true
        } else {
            s.stop(pc.yellow(`⚠ Could not automatically update layout file - structure not recognized`))
            return false
        }
    } catch (error) {
        s.stop(pc.yellow(`⚠ Error updating layout file: ${error}`))
        return false
    }
}

/**
 * Attempts to automatically modify a Next.js Pages Router _app.tsx file
 * to add the AuthProvider wrapper around the Component.
 */
export async function updatePagesRouterApp(
    appPath: string, 
    s: Spinner
): Promise<boolean> {
    s.start(`Analyzing _app.tsx file at ${pc.cyan(appPath)}`)
    
    try {
        // Initialize ts-morph project with manipulations format settings
        const project = new Project({
            manipulationSettings: {
                indentationText: "  " as any, // Two spaces for indentation
                useTrailingCommas: true,
                insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: true,
            }
        })
        const sourceFile = project.addSourceFileAtPath(appPath)
        
        // Check if AuthProvider is already imported
        let hasAuthProviderImport = false
        sourceFile.getImportDeclarations().forEach(importDecl => {
            if (importDecl.getModuleSpecifierValue() === '@propelauth/nextjs/client' &&
                importDecl.getNamedImports().some(named => named.getName() === 'AuthProvider')) {
                hasAuthProviderImport = true
            }
        })
        
        // Add import if not present
        if (!hasAuthProviderImport) {
            sourceFile.addImportDeclaration({
                moduleSpecifier: '@propelauth/nextjs/client',
                namedImports: ['AuthProvider']
            })
        }
        
        // Find the App component's return statement
        let modified = false
        const appFunctions = sourceFile.getFunctions().filter(f => 
            f.getName() === 'App' || 
            f.getFirstDescendantByKind(SyntaxKind.ExportKeyword)
        )
        
        if (appFunctions.length > 0) {
            const appFunction = appFunctions[0]
            const returnStatement = appFunction.getFirstDescendantByKind(SyntaxKind.ReturnStatement)
            
            if (returnStatement) {
                // Check if Component is already wrapped in AuthProvider
                let hasAuthProvider = false
                returnStatement.forEachDescendant(node => {
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
                    const hasComplexStructure = returnContent.includes('Provider') || 
                        (returnContent.includes('<') && returnContent.includes('>') && 
                         matchResult && matchResult.length > 2)
                    
                    if (hasComplexStructure) {
                        // Find the innermost Component reference
                        let innermostComponent: any = null
                        let deepestLevel = -1
                        
                        const findInnermostComponent = (node: any, level: number) => {
                            if ((node.getKind() === SyntaxKind.JsxSelfClosingElement || 
                                 node.getKind() === SyntaxKind.JsxOpeningElement)) {
                                const tagName = node.getFirstChildByKind(SyntaxKind.Identifier)
                                if (tagName && tagName.getText() === 'Component' && level > deepestLevel) {
                                    innermostComponent = node.getKind() === SyntaxKind.JsxSelfClosingElement ? 
                                        node : node.getParent()
                                    deepestLevel = level
                                }
                            }
                            node.forEachChild((child: any) => findInnermostComponent(child, level + 1))
                        }
                        
                        returnStatement.forEachChild((child: any) => findInnermostComponent(child, 0))
                        
                        if (innermostComponent) {
                            // Found the innermost Component, wrap it with proper structure
                            // Use the inherent JSX structure to let ts-morph handle indentation
                            innermostComponent.replaceWithText(`<AuthProvider authUrl={process.env.NEXT_PUBLIC_AUTH_URL!}>${innermostComponent.getText()}</AuthProvider>`)
                            modified = true
                        } else {
                            s.stop(pc.yellow(`⚠ Could not locate Component in the return statement`))
                            return false
                        }
                    } else {
                        // Simple structure, use the original approach
                        // Find Component JSX element
                        let componentElement: JsxElement | JsxSelfClosingElement | undefined
                        
                        returnStatement.forEachDescendant(node => {
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
                            componentElement.replaceWithText(`<AuthProvider authUrl={process.env.NEXT_PUBLIC_AUTH_URL!}>${componentElement.getText()}</AuthProvider>`)
                            modified = true
                        }
                    }
                }
            }
        }
        
        if (modified) {
            // Get the modified source text
            const updatedCode = sourceFile.getFullText()
            
            // Show diff and confirm changes
            await overwriteFileWithConfirmation(
                appPath,
                updatedCode,
                '_app.tsx with AuthProvider',
                s,
                true
            )
            s.stop(`✓ Updated _app.tsx with AuthProvider`)
            return true
        } else if (hasAuthProviderImport && appFunctions.length > 0) {
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

    s.stop('Found project details')
    
    // Use simplified log output
    log.info(`Detected Next.js ${pc.green(nextVersion || '(unknown)')}`)

    return {
        nextVersion,
        appRouterDir,
        pagesRouterDir,
        isUsingSrcDir,
    }
}
