import pc from 'picocolors'
import fs from 'fs/promises'
import { intro, outro, spinner } from '@clack/prompts'
import { CONFIG_FILE, getApiKey, getConfig, selectProject } from './login.js'
import { fetchProjects } from '../api.js'

export default async function setDefaultProject(): Promise<void> {
    intro(pc.green('Set Default Project'))

    const apiKey = await getApiKey()
    if (!apiKey) {
        outro(pc.red('Please login first using the login command'))
        process.exit(1)
    }

    const s = spinner()
    s.start('Fetching your projects')
    const result = await fetchProjects(apiKey)

    if (!result.success) {
        s.stop('Failed to fetch projects')
        if (result.error === 'unauthorized') {
            outro(pc.red('Your API key appears to be invalid. Please login again.'))
        } else {
            outro(pc.red(`Error: ${result.error}`))
        }
        process.exit(1)
    }

    s.stop('Projects fetched successfully')

    const config = await getConfig()
    const selectedProject = await selectProject(result.data.projects, config?.selectedProject?.projectId)

    if (selectedProject) {
        const newConfig = {
            ...config,
            apiKey,
            selectedProject,
        }
        await fs.writeFile(CONFIG_FILE, JSON.stringify(newConfig, null, 2))
        outro(pc.green(`Default project set to ${pc.cyan(selectedProject.displayName)}`))
    } else {
        outro(pc.yellow('No projects available to select'))
    }
}
