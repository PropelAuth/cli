import path from 'path'
import os from 'os'
import fs from 'fs/promises'
import pc from 'picocolors'
import { intro, outro, password, confirm, spinner, select } from '@clack/prompts'
import { isCancel } from '@clack/core'
import { ProjectResponse } from '../types/api.js'
import { fetchProjects } from '../api.js'

const CONFIG_DIR = path.join(os.homedir(), '.propelauth')
export const CONFIG_FILE = path.join(CONFIG_DIR, 'config')

export interface PropelauthConfig {
    apiKey: string
    selectedProject?: {
        orgId: string
        projectId: string
        displayName: string
    }
}

export async function getConfig(): Promise<PropelauthConfig | null> {
    try {
        const configStr = await fs.readFile(CONFIG_FILE, 'utf-8')
        return JSON.parse(configStr) as PropelauthConfig
    } catch {
        return null
    }
}

export async function getApiKey(): Promise<string | null> {
    const config = await getConfig()
    return config?.apiKey?.trim() ?? null
}

function formatProjectName(project: ProjectResponse): string {
    const maxLength = process.stdout.columns - 10 // Leave some padding
    const displayName = `${project.org_name} / ${project.name}`

    if (displayName.length <= maxLength) {
        return displayName
    }

    // If we need to truncate, ensure we show at least some of both parts
    const halfMax = Math.floor(maxLength / 2) - 2 // -2 for the " / " separator
    const orgPart = project.org_name.slice(0, halfMax)
    const projectPart = project.name.slice(0, halfMax)
    return `${orgPart}... / ${projectPart}...`
}

export async function selectProject(
    projects: ProjectResponse[],
    currentProjectId?: string
): Promise<PropelauthConfig['selectedProject'] | null> {
    if (projects.length === 0) {
        return null
    }

    // Sort projects: current first, then alphabetically by org/name
    const sortedProjects = [...projects].sort((a, b) => {
        // Current project always comes first
        if (a.project_id === currentProjectId) return -1
        if (b.project_id === currentProjectId) return 1

        // Otherwise sort by org name, then project name
        const aName = `${a.org_name} / ${a.name}`.toLowerCase()
        const bName = `${b.org_name} / ${b.name}`.toLowerCase()
        return aName.localeCompare(bName)
    })

    const choices = sortedProjects.map((project) => ({
        value: project,
        label: formatProjectName(project),
        hint: project.project_id === currentProjectId ? 'current' : undefined,
    }))

    const selected: symbol | ProjectResponse = await select({
        message: 'Select a project to use',
        options: choices,
        initialValue: choices[0].value,
    })

    if (isCancel(selected)) {
        outro(pc.red('Project selection cancelled'))
        process.exit(0)
    }

    return {
        orgId: selected.org_id,
        projectId: selected.project_id,
        displayName: formatProjectName(selected),
    }
}

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
    intro(pc.green('PropelAuth Login'))

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
            outro(pc.green('Using existing API key'))
            skipSettingKey = true
        } else {
            skipSettingKey = false
        }
    }

    if (!skipSettingKey || !existingApiKey) {
        const apiKey = await promptForApiKey()
        if (!apiKey) return

        // Create config directory if it doesn't exist
        await fs.mkdir(CONFIG_DIR, { recursive: true })

        // Save the API key
        const newConfig: PropelauthConfig = { apiKey }
        await fs.writeFile(CONFIG_FILE, JSON.stringify(newConfig, null, 2))

        existingApiKey = apiKey
    }

    // Fetch and display projects
    const s = spinner()
    while (true) {
        s.start('Fetching your projects')
        const result = await fetchProjects(existingApiKey)

        if (result.success) {
            s.stop('Projects fetched successfully')

            const selectedProject = await selectProject(result.data.projects, config?.selectedProject?.projectId)
            if (selectedProject) {
                // Save the API key and selected project
                const newConfig: PropelauthConfig = {
                    apiKey: existingApiKey,
                    selectedProject,
                }
                await fs.writeFile(CONFIG_FILE, JSON.stringify(newConfig, null, 2))

                outro(pc.green(`Successfully logged in and selected project ${pc.cyan(selectedProject.displayName)}`))
            } else {
                outro(pc.yellow('No projects available to select'))
            }
            break
        } else {
            s.stop('Failed to fetch projects')
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
                const newConfig: PropelauthConfig = { apiKey: newApiKey }
                await fs.writeFile(CONFIG_FILE, JSON.stringify(newConfig, null, 2))
                existingApiKey = newApiKey
                continue
            }

            console.error(pc.red(`\nError: ${result.error}`))
            break
        }
    }
}
