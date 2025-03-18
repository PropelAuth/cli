import fs from 'fs/promises'
import path from 'path'
import pc from 'picocolors'
import { intro, outro, password, confirm, spinner, log } from '@clack/prompts'
import { isCancel } from '@clack/core'
import { fetchProjects } from '../api.js'
import { CONFIG_FILE, PropelAuthConfig, getConfig, selectProject } from '../helpers/projectUtils.js'

async function promptForApiKey(): Promise<string> {
    log.info('Please visit the following URL to create a personal API key:')
    log.info(pc.underline(pc.cyan('https://auth.propelauth.com/api_keys/personal')))

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
    let skipSettingKey = false

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
        }
    }

    if (!existingApiKey || !skipSettingKey) {
        const apiKey = await promptForApiKey()

        const s = spinner()
        s.start('Validating API key')
        const validationResult = await fetchProjects(apiKey)

        if (!validationResult.success) {
            s.stop(pc.red('✗ Invalid API key'))

            if (validationResult.error === 'unauthorized') {
                outro(pc.red('\nError: Invalid API key'))
                process.exit(1)
            } else {
                console.error(pc.red(`\nError: ${validationResult.error}`))
                outro(pc.red('Login failed'))
                process.exit(1)
            }
        }

        s.stop('✓ API key validated')

        // Create config directory if it doesn't exist
        await fs.mkdir(path.dirname(CONFIG_FILE), { recursive: true })

        // Save the validated API key
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
    let projectData = null
    let s = spinner()

    s.start('Fetching your projects')
    const result = await fetchProjects(existingApiKey)

    if (result.success) {
        s.stop('✓ Projects fetched successfully')
        projectData = result.data
    } else {
        s.stop(pc.red('✗ Failed to fetch projects'))
        if (result.error === 'unauthorized') {
            outro(pc.red('\nError: Invalid API key'))
            process.exit(1)
        } else {
            console.error(pc.red(`\nError: ${result.error}`))
            outro(pc.red('Fetching projects failed'))
            process.exit(1)
        }
    }

    // Process projects if we have them
    if (projectData) {
        const currentProjectId =
            config?.projectSelection?.option === 'use-default'
                ? config.projectSelection.defaultProject.projectId
                : undefined

        const projectSelection = await selectProject(projectData.projects, currentProjectId)

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
    }
}
