import path from 'path'
import pc from 'picocolors'
import { spinner, intro, outro, confirm } from '@clack/prompts'
import { isCancel } from '@clack/core'

import { updateEnvFile } from './envUtils'
import { ensureDirectory, loadResource, overwriteFileWithConfirmation } from './fileUtils'
import { validateNextJsProject } from './validateNextJsProject'
import { promptForJsInstall } from './javascriptUtils'

type Spinner = {
    start: (msg?: string) => void
    stop: (msg?: string) => void
}

const REQUIRED_ENV_VARS = {
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

export default async function setupNextJs(targetDir: string): Promise<void> {
    intro(pc.cyan('Setting up authentication in Next.js project'))

    const s: Spinner = spinner()
    const targetPath = path.resolve(process.cwd(), targetDir || '.')

    try {
        const { nextVersion, appRouterDir, pagesRouterDir, isUsingSrcDir } = await validateNextJsProject(targetPath, s)

        await promptForJsInstall(targetPath, s, '@propelauth/nextjs')

        const envPath = path.join(targetPath, '.env.local')
        await updateEnvFile(envPath, REQUIRED_ENV_VARS, s)

        if (appRouterDir) {
            const authApiDir = path.join(appRouterDir, 'api', 'auth', '[slug]')
            await ensureDirectory(authApiDir, s)

            const routeTemplatePath = path.join(__dirname, 'templates', 'nextjs', 'route.ts')
            let routeContent = await loadResource(routeTemplatePath)
            const nextMajor = parseInt((nextVersion || '15').split('.')[0], 10)
            const useAsyncHandlers = nextMajor >= 15
            if (!useAsyncHandlers) {
                routeContent = routeContent
                    .replace('getRouteHandlerAsync', 'getRouteHandler')
                    .replace('postRouteHandlerAsync', 'postRouteHandler')
            }
            const routeFilePath = path.join(authApiDir, 'route.ts')
            await overwriteFileWithConfirmation(routeFilePath, routeContent, 'Auth route.ts', s)

            const middlewareTemplatePath = path.join(__dirname, 'templates', 'nextjs', 'middleware.ts')
            const middlewareContent = await loadResource(middlewareTemplatePath)
            const middlewareFilePath = path.join(targetPath, isUsingSrcDir ? 'src/middleware.ts' : 'middleware.ts')
            await overwriteFileWithConfirmation(middlewareFilePath, middlewareContent, 'Middleware file', s)

            const layoutPath = path.join(appRouterDir, 'layout.tsx')
            s.start('Checking root layout configuration')
            try {
                await (await import('fs')).promises.stat(layoutPath)
                s.stop('Found root layout at ' + pc.cyan(path.relative(targetPath, layoutPath)))

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
   ${pc.green('<AuthProvider authUrl={process.env.NEXT_PUBLIC_AUTH_URL!}>')}
     ${pc.yellow('<html lang="en">')}
       ${pc.yellow('<body>{children}</body>')}
     ${pc.yellow('</html>')}
   ${pc.green('</AuthProvider>')}
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
                    outro(pc.yellow('Please make the required changes to your root layout.'))
                }
            } catch (err) {
                s.stop(pc.yellow('No root layout found; skipping instructions for AuthProvider setup.'))
            }
        }

        outro(pc.green('Next.js setup completed!'))
        outro(`${pc.cyan('Next steps:')}
1. Fill in your environment variables in ${pc.cyan('.env.local')}
2. Confirm your authentication config in the dashboard or .env file
3. Enjoy your new Next.js project with authentication!`)
    } catch (error: any) {
        outro(pc.red(`Error: ${error.message}`))
        process.exit(1)
    }
}
