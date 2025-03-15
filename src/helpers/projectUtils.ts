import path from 'path'
import os from 'os'
import fs from 'fs/promises'
import pc from 'picocolors'
import { select, outro, spinner, log } from '@clack/prompts'
import { isCancel } from '@clack/core'
import { ProjectResponse, TestEnv } from '../types/api.js'
import { fetchProjects } from '../api.js'

const CONFIG_DIR = path.join(os.homedir(), '.propelauth')
export const CONFIG_FILE = path.join(CONFIG_DIR, 'config')

export interface PropelAuthProject {
    orgId: string
    projectId: string
    displayName: string
}

export interface PropelAuthConfig {
    apiKey: string
    projectSelection:
        | {
              option: 'always-ask'
          }
        | {
              option: 'use-default'
              defaultProject: PropelAuthProject
          }
}

export async function getConfig(): Promise<PropelAuthConfig | null> {
    try {
        const configStr = await fs.readFile(CONFIG_FILE, 'utf-8')
        return JSON.parse(configStr) as PropelAuthConfig
    } catch {
        return null
    }
}

export async function getApiKey(): Promise<string | null> {
    const config = await getConfig()
    return config?.apiKey?.trim() ?? null
}

export function formatProjectName(project: ProjectResponse): string {
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
): Promise<PropelAuthConfig['projectSelection'] | null> {
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

    // Add "Always ask" option
    const choices = [
        {
            value: 'always-ask',
            label: 'Always ask which project to use',
            hint: 'You will be prompted for each command',
        },
        ...sortedProjects.map((project) => ({
            value: project,
            label: formatProjectName(project),
            hint: project.project_id === currentProjectId ? 'current' : undefined,
        })),
    ]

    const selected: symbol | ProjectResponse | string = await select({
        message: 'Select a project to use',
        options: choices,
        initialValue: choices[0].value,
    })

    if (isCancel(selected)) {
        outro(pc.red('Project selection cancelled'))
        process.exit(0)
    }

    if (selected === 'always-ask') {
        // If they chose "always ask", then immediately ask them to select a project for this session
        const sessionProject: symbol | ProjectResponse = await select({
            message: 'Select a project for this session',
            options: sortedProjects.map((project) => ({
                value: project,
                label: formatProjectName(project),
                hint: project.project_id === currentProjectId ? 'current' : undefined,
            })),
            initialValue: sortedProjects[0],
        })

        if (isCancel(sessionProject)) {
            outro(pc.red('Project selection cancelled'))
            process.exit(0)
        }

        // Return project selection with 'always-ask' option
        return {
            option: 'always-ask',
        }
    }

    // Return project selection with 'use-default' option and defaultProject
    return {
        option: 'use-default',
        defaultProject: toProject(selected as ProjectResponse),
    }
}

function toProject(projectResponse: ProjectResponse): PropelAuthProject {
    return {
        orgId: projectResponse.org_id,
        projectId: projectResponse.project_id,
        displayName: formatProjectName(projectResponse),
    }
}

export async function promptForProjectIfNeeded(): Promise<PropelAuthProject | null> {
    const config = await getConfig()

    if (!config || !config.apiKey) {
        outro(pc.red('Please login first using the login command'))
        process.exit(1)
    }

    if (!config.projectSelection) {
        outro(pc.red('Please login first using the login command'))
        process.exit(1)
    } else if (config.projectSelection.option === 'use-default') {
        log.success(`✓ Using default project: ${pc.cyan(config.projectSelection.defaultProject.displayName)}`)
        return config.projectSelection.defaultProject
    }

    // If project selection is always-ask, fetch projects and prompt the user
    const result = await fetchProjects(config.apiKey)

    if (!result.success) {
        if (result.error === 'unauthorized') {
            outro(pc.red('Your API key appears to be invalid. Please login again.'))
        } else {
            outro(pc.red(`Error: ${result.error}`))
        }
        process.exit(1)
    }

    if (result.data.projects.length === 0) {
        outro(pc.yellow('No projects available to select'))
        process.exit(1)
    }

    // Sort projects alphabetically by org/name
    const sortedProjects = [...result.data.projects].sort((a, b) => {
        const aName = `${a.org_name} / ${a.name}`.toLowerCase()
        const bName = `${b.org_name} / ${b.name}`.toLowerCase()
        return aName.localeCompare(bName)
    })

    const selected: symbol | PropelAuthProject = await select({
        message: 'Select a project to use for this command',
        options: sortedProjects.map((project) => ({
            value: toProject(project),
            label: `${project.org_name} / ${project.name}`,
        })),
        initialValue: toProject(sortedProjects[0]),
    })

    if (isCancel(selected)) {
        outro(pc.red('Project selection cancelled'))
        process.exit(0)
    }

    return selected
}
