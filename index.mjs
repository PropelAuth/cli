import { Command } from 'commander'
import generateAccessToken from './generate-access-token.mjs'
import runMockServer from './run-mock-server.mjs'
import setupNextJsAppRouter from './setup-nextjs-app-router.mjs'
const program = new Command()

program.name('propelauth').description('CLI for setting up and debugging PropelAuth authentication').version('0.0.1')

// program
//     .command('gen-token')
//     .description('Generate an access token for a user')
//     .option('-u, --userId <userId>', 'the user ID to generate the token for')
//     .option('-e, --email <email>', 'the email address to generate the token for')
//     .action(async (str, options) => {
//         const { userId, email } = options.opts()
//         await generateAccessToken({ userId, email })
//     })

// program
//     .command('run-mock-server')
//     .description('Run a mock server for testing your frontend')
//     .option('-p, --port <port>', 'port to run the server on', '3030')
//     .action(async (options) => {
//         await runMockServer(options.port)
//     })

program
    .command('setup-nextjs-app-router')
    .description('Set up PropelAuth authentication in a Next.js App Router project')
    .argument('[directory]', 'Target directory (defaults to current directory)')
    .action(async (directory) => {
        await setupNextJsAppRouter(directory)
    })

await program.parseAsync()
