import fs from 'fs/promises'
import pc from 'picocolors'
import { intro, outro, confirm } from '@clack/prompts'
import { isCancel } from '@clack/core'
import { CONFIG_FILE, getConfig } from '../helpers/projectUtils.js'

export default async function logout(): Promise<void> {
    intro(pc.cyan('⚡ PropelAuth Logout'))

    // Check if config exists
    const config = await getConfig()
    
    if (!config || !config.apiKey) {
        outro(pc.yellow('You are not currently logged in'))
        return
    }

    // Confirm logout
    const shouldLogout = await confirm({
        message: 'Are you sure you want to log out?',
        active: 'Yes',
        inactive: 'No',
        initialValue: false,
    })

    if (isCancel(shouldLogout) || !shouldLogout) {
        outro(pc.yellow('Logout cancelled'))
        return
    }

    try {
        // Write an empty config
        await fs.writeFile(CONFIG_FILE, JSON.stringify({}, null, 2))
        outro(pc.green('✓ Successfully logged out'))
    } catch (error) {
        outro(pc.red(`Error logging out: ${error instanceof Error ? error.message : String(error)}`))
    }
}