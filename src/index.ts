#!/usr/bin/env node

import { Command } from 'commander'
import setupNextJsAppRouter from './commands/setup-nextjs-app-router.js'
import login from './commands/login.js'
import setDefaultProject from './commands/set-default-project.js'
import { resolvePath } from './helpers/fileUtils.js'

const program = new Command()

program.name('propelauth').description('CLI for setting up and debugging PropelAuth authentication').version('0.0.2')

program
    .command('setup-nextjs-app-router')
    .description('Set up PropelAuth authentication in a Next.js App Router project')
    .argument('[directory]', 'Target directory (defaults to current directory)')
    .action(async (directory: string | undefined) => {
        const resolvedPath = resolvePath(directory)
        await setupNextJsAppRouter(resolvedPath)
    })

program
    .command('login')
    .description('Login to PropelAuth')
    .action(async () => {
        await login()
    })

program
    .command('set-default-project')
    .description('Set the default project to use')
    .action(async () => {
        await setDefaultProject()
    })

program.parseAsync()
