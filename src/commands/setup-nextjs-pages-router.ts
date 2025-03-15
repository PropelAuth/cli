import path from 'path'
import pc from 'picocolors'
import { spinner, intro, outro, confirm, log } from '@clack/prompts'
import { isCancel } from '@clack/core'

import { ensureDirectory, overwriteFileWithConfirmation } from '../helpers/fileUtils.js'
import {
    validateNextJsProject,
    getPort,
    configureNextJsEnvironmentVariables,
    configureNextJsRedirectPaths,
    updatePagesRouterApp,
} from '../helpers/framework/nextJsUtils.js'
import { promptForJsInstall } from '../helpers/lang/javascriptUtils.js'
import { loadTemplateResource } from '../helpers/templateUtils.js'
import { promptForProjectIfNeeded } from '../helpers/projectUtils.js'

export default async function setupNextJsPagesRouter(targetDir: string): Promise<void> {
    log.info(`${pc.cyan('Welcome!')} We'll set up PropelAuth authentication in your Next.js Pages Router project.`)

    const targetPath = path.resolve(process.cwd(), targetDir || '.')
    const s = spinner()

    try {
        // Prompt for project selection if needed
        const selectedProject = await promptForProjectIfNeeded()
        if (!selectedProject) {
            outro('No project selected. Please run the login command first.')
            process.exit(1)
        }

        const { nextVersion, pagesRouterDir, isUsingSrcDir } = await validateNextJsProject(targetPath)

        // Ensure that they are using the Pages Router
        if (!pagesRouterDir) {
            log.error('This project does not appear to be using the Pages Router.')
            process.exit(1)
        }

        log.success(`✓ Found Next.js ${nextVersion || 'unknown'} project with App Router`)

        // Detect port from Next.js configuration
        const port = await getPort(targetPath)

        // Configure environment variables with values from the PropelAuth API
        const envPath = path.join(targetPath, '.env.local')
        await configureNextJsEnvironmentVariables(envPath, selectedProject, s)

        // Configure redirect paths in PropelAuth dashboard
        await configureNextJsRedirectPaths(selectedProject, s, port)

        await promptForJsInstall(targetPath, s, '@propelauth/nextjs')

        // Create app directory if needed
        const appRouterDir = path.join(targetPath, isUsingSrcDir ? 'src/app' : 'app')
        await ensureDirectory(appRouterDir)

        // Set up auth API routes in app directory
        const authApiDir = path.join(appRouterDir, 'api', 'auth', '[slug]')
        await ensureDirectory(authApiDir)

        let routeContent = await loadTemplateResource('nextjs', 'route.ts')
        const nextMajor = parseInt((nextVersion || '15').split('.')[0], 10)
        const useAsyncHandlers = nextMajor >= 15
        if (!useAsyncHandlers) {
            routeContent = routeContent
                .replace('getRouteHandlerAsync', 'getRouteHandler')
                .replace('postRouteHandlerAsync', 'postRouteHandler')
        }

        const routeFilePath = path.join(authApiDir, 'route.ts')
        await overwriteFileWithConfirmation(routeFilePath, routeContent, 'Auth route.ts')

        const appPath = path.join(pagesRouterDir, '_app.tsx')
        try {
            await (await import('fs')).promises.stat(appPath)

            // Try to automatically update the _app.tsx file
            const autoUpdateSuccess = await updatePagesRouterApp(appPath, s)

            if (!autoUpdateSuccess) {
                // Fall back to manual instructions if automatic update fails
                log.info(`${pc.cyan('_app.tsx Changes Required:')}

1. Add this import at the top of ${pc.cyan(appPath)}:
   ${pc.green('import { AuthProvider } from "@propelauth/nextjs/client";')}

2. Wrap your Component with AuthProvider:

   ${pc.dim('Before:')}
   ${pc.yellow('export default function App({ Component, pageProps }: AppProps) {')}
   ${pc.yellow('  return <Component {...pageProps} />')}
   ${pc.yellow('}')}

   ${pc.dim('After:')}
   ${pc.yellow('export default function App({ Component, pageProps }: AppProps) {')}
   ${pc.yellow('  return (')}
   ${pc.green('    <AuthProvider authUrl={process.env.NEXT_PUBLIC_AUTH_URL!}>')}
   ${pc.yellow('      <Component {...pageProps} />')}
   ${pc.green('    </AuthProvider>')}
   ${pc.yellow('  )')}
   ${pc.yellow('}')}`)

                const answer = await confirm({
                    message: 'Have you made these changes to your _app.tsx?',
                    active: pc.green('yes'),
                    inactive: pc.yellow('no'),
                    initialValue: false,
                })
                if (isCancel(answer)) {
                    outro(pc.red('Setup cancelled'))
                    process.exit(0)
                }
                if (!answer) {
                    outro(pc.yellow('⚠ Please make the required changes to your _app.tsx.'))
                }
            }
        } catch (err) {
            outro(pc.yellow('⚠ No _app.tsx found; skipping instructions for AuthProvider setup.'))
        }

        log.success('✓ PropelAuth setup completed!')

        // Show example usage code snippets
        console.log(`
${pc.cyan('Example Usage:')}
${pc.dim('─────────────────────────────────────────────')}

${pc.bold('Server-Side Page Example:')}
${pc.green(`import { getUserFromServerSideProps } from "@propelauth/nextjs/server/pages";

const WelcomeMessage = () => {
    return <div>Welcome to your authenticated page!</div>
}

export async function getServerSideProps(context) {
    const user = await getUserFromServerSideProps(context)
    if (!user) {
        return { redirect: { destination: '/api/auth/login' } }
    }
    
    return {
        props: {
            user: {
                email: user.email,
                // other user properties you need
            },
        },
    }
}`)}

${pc.bold('Client Component Example:')}
${pc.green(`import { useUser } from "@propelauth/nextjs/client";

const WelcomeMessage = () => {
    const {loading, user} = useUser()
    if (loading) {
        return <div>Loading...</div>
    } else if (user) {
        return <div>Welcome, {user.email}!</div>
    } else {
        return <div>Please log in to be welcomed</div>
    }
}`)}
${pc.dim('─────────────────────────────────────────────')}

${pc.cyan('For full documentation and more examples, visit:')}
${pc.underline('https://docs.propelauth.com/reference/fullstack-apis/nextjspages/installation-and-setup')}`)
        outro(pc.green('PropelAuth has been successfully set up in your Next.js project!'))
        process.exit(0)
    } catch (error) {
        outro(pc.red(`Error: ${error}`))
        process.exit(1)
    }
}
