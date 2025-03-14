import pc from 'picocolors'
import { spinner, intro, outro, select } from '@clack/prompts'
import { isCancel } from '@clack/core'

import setupNextJsAppRouter from './setup-nextjs-app-router.js'
import setupNextJsPagesRouter from './setup-nextjs-pages-router.js'
import { resolvePath } from '../helpers/fileUtils.js'

// Type definition for framework options
type FrameworkOption = {
    value: string
    label: string
    hint?: string
}

export default async function setup(directory: string, options: { framework?: string }): Promise<void> {
    const resolvedPath = resolvePath(directory)
    const s = spinner()

    intro(pc.cyan('⚡ Setting up authentication in your project'))

    // If framework is provided via CLI option, use it directly
    if (options.framework) {
        await setupWithFramework(options.framework, resolvedPath)
        return
    }

    // Create options for the prompt
    const frameworkOptions: FrameworkOption[] = [
        {
            value: 'nextjs-app',
            label: 'Next.js (App Router)',
            hint: 'Uses app/ directory structure, introduced in Next.js 13',
        },
        {
            value: 'nextjs-pages',
            label: 'Next.js (Pages Router)',
            hint: 'Uses pages/ directory structure',
        },
        // Future frameworks can be added here
    ]

    // Prompt the user to select their framework
    const selectedFramework = await select({
        message: 'Select your project framework:',
        options: frameworkOptions,
    })

    // Handle cancellation
    if (isCancel(selectedFramework)) {
        outro(pc.red('Setup cancelled'))
        process.exit(0)
    }

    await setupWithFramework(selectedFramework as string, resolvedPath)
}

// Helper function to route to the correct setup function based on framework selection
async function setupWithFramework(framework: string, targetDir: string): Promise<void> {
    switch (framework) {
        case 'nextjs-app':
            await setupNextJsAppRouter(targetDir)
            break
        case 'nextjs-pages':
            await setupNextJsPagesRouter(targetDir)
            break
        default:
            outro(pc.red(`Unsupported framework: ${framework}`))
            process.exit(1)
    }
}
