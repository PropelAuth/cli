import path from 'path'
import pc from 'picocolors'
import { spinner, intro, outro, confirm, text, log } from '@clack/prompts'
import { isCancel } from '@clack/core'

import { ensureDirectory, overwriteFileWithConfirmation } from '../helpers/fileUtils.js'
import {
    validateNextJsProject,
    getPort,
    configureNextJsEnvironmentVariables,
    configureNextJsRedirectPaths,
} from '../helpers/framework/nextJsUtils.js'
import { promptForJsInstall } from '../helpers/lang/javascriptUtils.js'
import { loadTemplateResource } from '../helpers/templateUtils.js'
import { promptForProjectIfNeeded } from '../helpers/projectUtils.js'

type Spinner = {
    start: (msg?: string) => void
    stop: (msg?: string) => void
}

export default async function setupNextJsPagesRouter(targetDir: string): Promise<void> {
    intro(pc.cyan('⚡ Setting up authentication in Next.js project'))

    log.info(`${pc.cyan('Welcome!')} We are going to set up your Next.js Pages Router project with PropelAuth authentication.

This is a quick overview of the steps:
1. Select the PropelAuth project to tie this Next.js application to
2. Configure environment variables in .env.local
3. Configure redirect paths in PropelAuth dashboard
4. Install required dependencies (@propelauth/nextjs)
5. Set up auth API route handlers
6. Update your pages`)

    const shouldProceed = await confirm({
        message: 'Ready to get started?',
    })

    if (isCancel(shouldProceed) || !shouldProceed) {
        outro(pc.red('Ok, bye!'))
        process.exit(0)
    }

    const targetPath = path.resolve(process.cwd(), targetDir || '.')
    const s = spinner()

    try {
        // Prompt for project selection if needed
        log.info(pc.cyan('Selecting PropelAuth project'))
        const selectedProject = await promptForProjectIfNeeded()
        if (!selectedProject) {
            log.error('No project selected. Please run the login command first.')
            process.exit(1)
        }
        log.success(`✓ Using project: ${pc.cyan(selectedProject.displayName)}`)

        log.info('Checking Next.js project')
        const { nextVersion, pagesRouterDir, isUsingSrcDir } = await validateNextJsProject(targetPath, s)
        
        // Ensure that they are using the Pages Router
        if (!pagesRouterDir) {
            log.error('This project does not appear to be using the Pages Router.')
            process.exit(1)
        }
        
        log.success(
            `✓ Found Next.js ${nextVersion || 'unknown'} project with Pages Router at ${pc.cyan(path.relative(targetPath, pagesRouterDir))}`
        )

        // Detect port from Next.js configuration
        const port = await getPort(targetPath)

        // Configure environment variables with values from the PropelAuth API
        intro(pc.cyan('Setting up environment variables'))
        const envPath = path.join(targetPath, '.env.local')
        await configureNextJsEnvironmentVariables(envPath, selectedProject, s)

        // Configure redirect paths in PropelAuth dashboard
        intro(pc.cyan('Configuring PropelAuth redirect paths'))
        await configureNextJsRedirectPaths(selectedProject, s, port)

        intro(pc.cyan('Installing dependencies'))
        await promptForJsInstall(targetPath, s, '@propelauth/nextjs')

        intro(pc.cyan('Creating authentication routes'))
        s.start('Setting up API route handlers')
        
        // Create app directory if needed
        const appRouterDir = path.join(targetPath, isUsingSrcDir ? 'src/app' : 'app')
        await ensureDirectory(appRouterDir, s)
        
        // Set up auth API routes in app directory
        const authApiDir = path.join(appRouterDir, 'api', 'auth', '[slug]')
        await ensureDirectory(authApiDir, s)
        s.stop(`✓ Created API directory at ${pc.cyan(path.relative(targetPath, authApiDir))}`)

        let routeContent = await loadTemplateResource('nextjs', 'route.ts')
        const nextMajor = parseInt((nextVersion || '15').split('.')[0], 10)
        const useAsyncHandlers = nextMajor >= 15
        if (!useAsyncHandlers) {
            routeContent = routeContent
                .replace('getRouteHandlerAsync', 'getRouteHandler')
                .replace('postRouteHandlerAsync', 'postRouteHandler')
        }

        const routeFilePath = path.join(authApiDir, 'route.ts')
        intro(`Creating route handler at ${pc.cyan(path.relative(targetPath, routeFilePath))}`)
        await overwriteFileWithConfirmation(routeFilePath, routeContent, 'Auth route.ts', s)
        outro(`✓ Created route handler at ${pc.cyan(path.relative(targetPath, routeFilePath))}`)

        intro(pc.cyan('Configuring _app.tsx'))
        const appPath = path.join(pagesRouterDir, '_app.tsx')
        s.start('Checking _app.tsx configuration')
        try {
            await (await import('fs')).promises.stat(appPath)
            s.stop('✓ Found _app.tsx at ' + pc.cyan(path.relative(targetPath, appPath)))

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
        } catch (err) {
            s.stop(pc.yellow('⚠ No _app.tsx found; skipping instructions for AuthProvider setup.'))
        }

        log.success('✓ PropelAuth setup completed!')

        log.info(`Summary of changes:

1. Added authentication API routes at ${pc.cyan(`${path.relative(targetPath, authApiDir)}/route.ts`)}
2. Created/updated environment variables in ${pc.cyan('.env.local')}
3. Configured PropelAuth redirect paths for localhost:${port}`)

        // Show example usage code snippets
        log.info(`
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
${pc.underline('https://docs.propelauth.com/reference/fullstack-apis/nextjspages/installation-and-setup')}`
        )
        outro(pc.green('PropelAuth has been successfully set up in your Next.js project!'))
        process.exit(0)
    } catch (error) {
        outro(pc.red(`Error: ${error}`))
        process.exit(1)
    }
}