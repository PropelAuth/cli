import fs from 'fs/promises'
import pc from 'picocolors'
import { intro, outro, password, confirm, spinner } from '@clack/prompts'
import { isCancel } from '@clack/core'
import { fetchProjects } from '../api.js'
import { CONFIG_FILE, PropelAuthConfig, getConfig, selectProject } from '../helpers/projectUtils.js'

async function promptForApiKey(): Promise<string | null> {
    // Prompt user to visit the API key creation page
    console.log('\nPlease visit the following URL to create a personal API key:')
    console.log(pc.underline(pc.cyan('https://auth.propelauth.com/api_keys/personal')))
    console.log()

    // Get API key from user
    const apiKey = await password({
        message: 'Enter your API key',
        mask: '*',
    })

    if (isCancel(apiKey) || !apiKey) {
        outro(pc.red('Login cancelled'))
        process.exit(0)
    }

    return apiKey.toString().trim()
}

export default async function login(): Promise<void> {
    intro(pc.cyan('⚡ PropelAuth Login'))

    // Check if config already exists
    const config = await getConfig()
    let existingApiKey = config?.apiKey?.trim() ?? null
    let skipSettingKey = true

    if (existingApiKey) {
        const shouldOverwrite = await confirm({
            message: 'An API key is already configured. Would you like to overwrite it?',
            active: 'Yes',
            inactive: 'No',
            initialValue: false,
        })

        if (isCancel(shouldOverwrite)) {
            outro(pc.red('Login cancelled'))
            process.exit(0)
        }

        if (!shouldOverwrite) {
            outro(pc.green('✓ Using existing API key'))
            skipSettingKey = true
        } else {
            skipSettingKey = false
        }
    }

    if (!skipSettingKey || !existingApiKey) {
        const apiKey = await promptForApiKey()
        if (!apiKey) return

        // Create config directory if it doesn't exist
        await fs.mkdir(CONFIG_FILE.replace('/config', ''), { recursive: true })

        // Save the API key
        const newConfig: PropelAuthConfig = {
            apiKey,
            projectSelection: {
                option: 'always-ask',
            },
        }
        await fs.writeFile(CONFIG_FILE, JSON.stringify(newConfig, null, 2))

        existingApiKey = apiKey
    }

    // Fetch and display projects
    const s = spinner()
    while (true) {
        s.start('Fetching your projects')
        const result = await fetchProjects(existingApiKey)

        if (result.success) {
            s.stop('✓ Projects fetched successfully')

            const currentProjectId =
                config?.projectSelection?.option === 'use-default'
                    ? config.projectSelection.defaultProject.projectId
                    : undefined

            const projectSelection = await selectProject(result.data.projects, currentProjectId)

            if (projectSelection) {
                // Save the API key and selected project
                const newConfig: PropelAuthConfig = {
                    apiKey: existingApiKey,
                    projectSelection,
                }
                await fs.writeFile(CONFIG_FILE, JSON.stringify(newConfig, null, 2))

                if (projectSelection.option === 'always-ask') {
                    outro(pc.green('✓ Successfully logged in'))
                    outro(pc.cyan('ℹ You will be prompted to select a project for each command'))
                } else {
                    outro(
                        pc.green(
                            `✓ Successfully logged in and selected project ${pc.cyan(projectSelection.defaultProject.displayName)}`
                        )
                    )
                }
            } else {
                outro(pc.yellow('⚠ No projects available to select'))
            }
            break
        } else {
            s.stop(pc.red('✗ Failed to fetch projects'))
            if (result.error === 'unauthorized') {
                console.error(pc.red('\nError: Invalid API key'))

                const retry = await confirm({
                    message: 'Would you like to try with a different API key?',
                    active: 'Yes',
                    inactive: 'No',
                })

                if (isCancel(retry) || !retry) {
                    outro(pc.red('Login cancelled'))
                    process.exit(0)
                }

                const newApiKey = await promptForApiKey()
                if (!newApiKey) return

                // Save the new API key
                const newConfig: PropelAuthConfig = {
                    apiKey: newApiKey,
                    projectSelection: {
                        option: 'always-ask',
                    },
                }
                await fs.writeFile(CONFIG_FILE, JSON.stringify(newConfig, null, 2))
                existingApiKey = newApiKey
                continue
            }

            console.error(pc.red(`\nError: ${result.error}`))
            break
        }
    }
}
