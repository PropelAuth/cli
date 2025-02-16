import { Command } from 'commander'
import setupNextJsAppRouter from './commands/setup-nextjs-app-router'

const program = new Command()

program.name('propelauth').description('CLI for setting up and debugging PropelAuth authentication').version('0.0.1')

program
    .command('setup-nextjs-app-router')
    .description('Set up PropelAuth authentication in a Next.js App Router project')
    .argument('[directory]', 'Target directory (defaults to current directory)')
    .action(async (directory: string | undefined) => {
        await setupNextJsAppRouter(directory)
    })

// Note: Other commands will be converted in subsequent steps

program.parseAsync()
