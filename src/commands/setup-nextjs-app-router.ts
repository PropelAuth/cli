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
    updateAppRouterLayout,
} from '../helpers/framework/nextJsUtils.js'
import { promptForJsInstall } from '../helpers/lang/javascriptUtils.js'
import { loadTemplateResource } from '../helpers/templateUtils.js'
import { promptForProjectIfNeeded } from '../helpers/projectUtils.js'
import { sleep } from '../helpers/timeUtils.js'

export default async function setupNextJsAppRouter(targetDir: string): Promise<void> {
    log.info(`${pc.cyan('Welcome!')} We'll set up PropelAuth authentication in your Next.js App Router project.`)

    const targetPath = path.resolve(process.cwd(), targetDir || '.')
    const s = spinner()

    try {
        // Prompt for project selection if needed
        const selectedProject = await promptForProjectIfNeeded()
        if (!selectedProject) {
            outro('No project selected. Please run the login command first.')
            process.exit(1)
        }

        const { nextVersion, appRouterDir, isUsingSrcDir } = await validateNextJsProject(targetPath)

        // Ensure that they are using the app router
        if (!appRouterDir) {
            outro('This project does not appear to be using the App Router.')
            process.exit(1)
        }

        log.success(`✓ Found Next.js ${nextVersion || 'unknown'} project with App Router`)

        // Detect port or URL from Next.js configuration
        const portOrUrl = await getPort(targetPath)

        // Configure environment variables with values from the PropelAuth API
        const envPath = path.join(targetPath, '.env.local')
        await configureNextJsEnvironmentVariables(envPath, selectedProject, s, portOrUrl)
        await sleep(500)

        // Configure redirect paths in PropelAuth dashboard
        await configureNextJsRedirectPaths(selectedProject, s, portOrUrl)
        await sleep(500)

        await promptForJsInstall(targetPath, s, '@propelauth/nextjs')
        await sleep(500)

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
        log.success(`✓ Created authentication routes`)
        await sleep(500)

        const middlewareContent = await loadTemplateResource('nextjs', 'middleware.ts')
        const middlewareFilePath = path.join(targetPath, isUsingSrcDir ? 'src/middleware.ts' : 'middleware.ts')
        await overwriteFileWithConfirmation(middlewareFilePath, middlewareContent, 'Middleware file')
        log.success('✓ Created middleware')
        await sleep(500)

        const layoutPath = path.join(appRouterDir, 'layout.tsx')
        try {
            await (await import('fs')).promises.stat(layoutPath)
            const autoUpdateSuccess = await updateAppRouterLayout(layoutPath)
            if (!autoUpdateSuccess) {
                // Fall back to manual instructions if automatic update fails
                log.info(`${pc.cyan('Root Layout Changes Required:')}

1. Add this import at the top of ${pc.cyan(layoutPath)}:
   ${pc.green('import { AuthProvider } from "@propelauth/nextjs/client";')}

2. Wrap your children with AuthProvider:

   ${pc.dim('Before:')}
   ${pc.yellow('<html lang="en">')}
     ${pc.yellow('<body>{children}</body>')}
   ${pc.yellow('</html>')}

   ${pc.dim('After:')}
   ${pc.yellow('<html lang="en">')}
     ${pc.yellow('<body>')}
       ${pc.green('<AuthProvider authUrl={process.env.NEXT_PUBLIC_AUTH_URL!}>')}
         ${pc.green('{children}')}
       ${pc.green('</AuthProvider>')}
     ${pc.yellow('</body>')}
   ${pc.yellow('</html>')}`)

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
                    outro(pc.yellow('⚠ Please make the required changes to your root layout.'))
                }
            }
        } catch (err) {
            outro(pc.yellow('⚠ No root layout found; skipping instructions for AuthProvider setup.'))
        }

        log.success('✓ PropelAuth setup completed!')
        await sleep(500)

        // Show example usage code snippets
        console.log(`
${pc.cyan('Example Usage:')}
${pc.dim('─────────────────────────────────────────────')}

${pc.bold('Server Component Example:')}
import { getUserOrRedirect } from "@propelauth/nextjs/server/app-router";

const WelcomeMessage = async () => {
    const user = await getUserOrRedirect()
    return <div>Welcome, {user.email}!</div>
}

export default WelcomeMessage

${pc.dim('─────────────────────────────────────────────')}

${pc.bold('Client Component Example:')}
"use client";

import { useUser } from "@propelauth/nextjs/client";

const WelcomeMessage = () => {
    const {loading, user} = useUser()
    if (loading) {
        return <div>Loading...</div>
    } else if (user) {
        return <div>Welcome, {user.email}!</div>
    } else {
        return <div>Please log in to be welcomed</div>
    }
}

export default WelcomeMessage
${pc.dim('─────────────────────────────────────────────')}

${pc.cyan('For full documentation and more examples, visit:')}
${pc.underline('https://docs.propelauth.com/reference/fullstack-apis/nextjsapp/installation-and-setup')}`)
        outro(pc.green('PropelAuth has been successfully set up in your Next.js project!'))
        process.exit(0)
    } catch (error) {
        outro(pc.red(`Error: ${error}`))
        process.exit(1)
    }
}
