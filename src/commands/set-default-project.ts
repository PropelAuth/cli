import pc from 'picocolors'
import fs from 'fs/promises'
import { intro, outro, spinner } from '@clack/prompts'
import { CONFIG_FILE, getApiKey, getConfig, selectProject } from '../helpers/projectUtils.js'
import { fetchProjects } from '../api.js'

export default async function setDefaultProject(): Promise<void> {
    intro(pc.cyan('⚡ Set Default Project'))

    const apiKey = await getApiKey()
    if (!apiKey) {
        outro(pc.red('Please login first using the login command'))
        process.exit(1)
    }

    const s = spinner()
    s.start('Fetching your projects')
    const result = await fetchProjects(apiKey)

    if (!result.success) {
        s.stop(pc.red('✗ Failed to fetch projects'))
        if (result.error === 'unauthorized') {
            outro(pc.red('Your Personal API Key appears to be invalid. Please login again.'))
        } else {
            outro(pc.red(`Error: ${result.error}`))
        }
        process.exit(1)
    }

    s.stop('✓ Projects fetched successfully')

    const config = await getConfig()
    const currentProjectId = config?.projectSelection?.option === 'use-default' 
        ? config.projectSelection.defaultProject.projectId 
        : undefined
        
    const projectSelection = await selectProject(result.data.projects, currentProjectId)

    if (projectSelection) {
        const newConfig = {
            ...config,
            apiKey,
            projectSelection,
        }
        await fs.writeFile(CONFIG_FILE, JSON.stringify(newConfig, null, 2))
        
        if (projectSelection.option === 'always-ask') {
            outro(pc.green('✓ Project preference set to always ask for each command'))
        } else {
            outro(pc.green(`✓ Default project set to ${pc.cyan(projectSelection.defaultProject.displayName)}`))
        }
    } else {
        outro(pc.yellow('⚠ No projects available to select'))
    }
}
