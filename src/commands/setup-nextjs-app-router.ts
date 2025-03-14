import path from 'path'
import pc from 'picocolors'
import { spinner, intro, outro, confirm } from '@clack/prompts'
import { isCancel } from '@clack/core'

import { ensureDirectory, overwriteFileWithConfirmation } from '../helpers/fileUtils.js'
import { 
    validateNextJsProject, 
    getPort, 
    configureNextJsEnvironmentVariables, 
    configureNextJsRedirectPaths 
} from '../helpers/framework/nextJsUtils.js'
import { promptForJsInstall } from '../helpers/lang/javascriptUtils.js'
import { loadTemplateResource } from '../helpers/templateUtils.js'
import { promptForProjectIfNeeded } from '../helpers/projectUtils.js'
import { ProjectResponse } from '../types/api.js'

type Spinner = {
    start: (msg?: string) => void
    stop: (msg?: string) => void
}

export default async function setupNextJsAppRouter(targetDir: string): Promise<void> {
    intro(pc.cyan('⚡ Setting up authentication in Next.js project'))

    const s: Spinner = spinner()
    const targetPath = path.resolve(process.cwd(), targetDir || '.')

    try {
        // Prompt for project selection if needed
        const selectedProject = await promptForProjectIfNeeded()
        if (!selectedProject) {
            outro(pc.red('No project selected. Please run the login command first.'))
            process.exit(1)
        }

        outro(pc.green(`✓ Using project: ${pc.cyan(`${selectedProject.org_name} / ${selectedProject.name}`)}`))

        // Explain the setup process before starting
        console.log(pc.cyan('\nSetup Process Overview:'))
        console.log(pc.white(`1. Validate your Next.js project structure`))
        console.log(pc.white(`2. Configure environment variables in .env.local`))
        console.log(pc.white(`3. Configure redirect paths in PropelAuth dashboard`))
        console.log(pc.white(`4. Install required dependencies (@propelauth/nextjs)`))
        console.log(pc.white(`5. Set up auth API route handlers`))
        console.log(pc.white(`6. Set up middleware for authentication`))
        console.log(pc.white(`7. Help you update your root layout\n`))

        s.start('Validating Next.js project structure')
        const { nextVersion, appRouterDir, isUsingSrcDir } = await validateNextJsProject(targetPath, s)
        s.stop(
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
        console.log(pc.cyan('\nSetting up environment variables:'))
        const envPath = path.join(targetPath, '.env.local')
        await configureNextJsEnvironmentVariables(envPath, selectedProject, s)

        // Configure redirect paths in PropelAuth dashboard
        console.log(pc.cyan('\nConfiguring PropelAuth redirect paths:'))
        await configureNextJsRedirectPaths(selectedProject, s, port)

        console.log(pc.cyan('\nInstalling dependencies:'))
        await promptForJsInstall(targetPath, s, '@propelauth/nextjs')

        console.log(pc.cyan('\nCreating authentication routes:'))
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
        console.log(`Creating route handler at ${pc.cyan(path.relative(targetPath, routeFilePath))}`)
        await overwriteFileWithConfirmation(routeFilePath, routeContent, 'Auth route.ts', s)

        console.log(pc.cyan('\nSetting up middleware:'))
        const middlewareContent = await loadTemplateResource('nextjs', 'middleware.ts')
        const middlewareFilePath = path.join(targetPath, isUsingSrcDir ? 'src/middleware.ts' : 'middleware.ts')
        console.log(`Creating middleware at ${pc.cyan(path.relative(targetPath, middlewareFilePath))}`)
        await overwriteFileWithConfirmation(middlewareFilePath, middlewareContent, 'Middleware file', s)

        console.log(pc.cyan('\nConfiguring root layout:'))
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

        console.log(pc.cyan('\nSummary of changes:'))
        console.log(
            pc.white(
                `1. Added authentication API routes at ${pc.cyan(`${path.relative(targetPath, authApiDir)}/route.ts`)}`
            )
        )
        console.log(pc.white(`2. Added middleware at ${pc.cyan(path.relative(targetPath, middlewareFilePath))}`))
        console.log(pc.white(`3. Created/updated environment variables in ${pc.cyan('.env.local')}`))
        console.log(pc.white(`4. Configured PropelAuth redirect paths for localhost:${port}`))
    } catch (error) {
        outro(pc.red(`Error: ${error}`))
        process.exit(1)
    }
}
