import path from 'path'
import pc from 'picocolors'
import { spinner, intro, outro, confirm, text } from '@clack/prompts'
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

export default async function setupNextJsAppRouter(targetDir: string): Promise<void> {
    const introMessage = `${pc.cyan('⚡ Setting up authentication in Next.js project')}

${pc.cyan('Welcome!')} We are going to set up your Next.js App Router project with PropelAuth authentication.

This is a quick overview of the steps:
1. Select the PropelAuth project to tie this Next.js application to
2. Configure environment variables in .env.local
3. Configure redirect paths in PropelAuth dashboard
4. Install required dependencies (@propelauth/nextjs)
5. Set up auth API route handlers
6. Set up middleware for authentication
7. Update your root layout

Let's get started!\n`

    intro(introMessage)

    const targetPath = path.resolve(process.cwd(), targetDir || '.')

    try {
        // Prompt for project selection if needed
        const selectedProject = await promptForProjectIfNeeded()
        if (!selectedProject) {
            outro(pc.red('No project selected. Please run the login command first.'))
            process.exit(1)
        }

        outro(pc.green(`✓ Using project: ${pc.cyan(selectedProject.displayName)}`))

        intro('Validating Next.js project structure')
        const { nextVersion, appRouterDir, isUsingSrcDir } = await validateNextJsProject(targetPath, spinner())
        outro(
            `✓ Found Next.js ${nextVersion || 'unknown'} project with App Router${appRouterDir ? ' at ' + pc.cyan(path.relative(targetPath, appRouterDir)) : ''}`
        )

        // Ensure that they are using the app router
        if (!appRouterDir) {
            outro(pc.red('This project does not appear to be using the App Router.'))
            process.exit(1)
        }

        // Detect port from Next.js configuration
        const port = await getPort(targetPath)

        // Configure environment variables with values from the PropelAuth API
        intro(pc.cyan('Setting up environment variables'))
        const envPath = path.join(targetPath, '.env.local')
        await configureNextJsEnvironmentVariables(envPath, selectedProject, spinner())

        // Configure redirect paths in PropelAuth dashboard
        intro(pc.cyan('Configuring PropelAuth redirect paths'))
        await configureNextJsRedirectPaths(selectedProject, spinner(), port)

        intro(pc.cyan('Installing dependencies'))
        await promptForJsInstall(targetPath, spinner(), '@propelauth/nextjs')

        intro(pc.cyan('Creating authentication routes'))
        const s = spinner()
        s.start('Setting up API route handlers')
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

        intro(pc.cyan('Setting up middleware:'))
        const middlewareContent = await loadTemplateResource('nextjs', 'middleware.ts')
        const middlewareFilePath = path.join(targetPath, isUsingSrcDir ? 'src/middleware.ts' : 'middleware.ts')
        await overwriteFileWithConfirmation(middlewareFilePath, middlewareContent, 'Middleware file', s)
        outro(`Created middleware at ${pc.cyan(path.relative(targetPath, middlewareFilePath))}`)

        intro(pc.cyan('Configuring root layout'))
        const layoutPath = path.join(appRouterDir, 'layout.tsx')
        s.start('Checking root layout configuration')
        try {
            await (await import('fs')).promises.stat(layoutPath)
            s.stop('✓ Found root layout at ' + pc.cyan(path.relative(targetPath, layoutPath)))

            outro(`
${pc.cyan('Root Layout Changes Required:')}

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
                outro(pc.yellow('⚠ Please make the required changes to your root layout.'))
            }
        } catch (err) {
            s.stop(pc.yellow('⚠ No root layout found; skipping instructions for AuthProvider setup.'))
        }

        outro(pc.green('✓ PropelAuth setup completed!'))

        const outroMessage = `Summary of changes:

1. Added authentication API routes at ${pc.cyan(`${path.relative(targetPath, authApiDir)}/route.ts`)}
2. Added middleware at ${pc.cyan(path.relative(targetPath, middlewareFilePath))}
3. Created/updated environment variables in ${pc.cyan('.env.local')}
4. Configured PropelAuth redirect paths for localhost:${port}`
        outro(outroMessage)
        process.exit(0)
    } catch (error) {
        outro(pc.red(`Error: ${error}`))
        process.exit(1)
    }
}
