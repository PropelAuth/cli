#!/usr/bin/env node

import { Command } from 'commander'
import setup from './commands/setup.js'
import login from './commands/login.js'
import setDefaultProject from './commands/set-default-project.js'
import { resolvePath } from './helpers/fileUtils.js'

const program = new Command()

program.name('propelauth').description('CLI for setting up and debugging PropelAuth authentication').version('0.0.2')

// Main setup command
program
    .command('setup')
    .description('Set up PropelAuth authentication in your project')
    .argument('[directory]', 'Target directory (defaults to current directory)')
    .option('-f, --framework <framework>', 'Specify the framework (nextjs-app, nextjs-pages)')
    .action(async (directory: string | undefined, options: { framework?: string }) => {
        const resolvedPath = resolvePath(directory || '.')
        await setup(resolvedPath, options)
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
