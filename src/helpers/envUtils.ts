import { intro, outro } from '@clack/prompts'
import fs from 'fs/promises'
import pc from 'picocolors'

type Spinner = {
    start: (msg?: string) => void
    stop: (msg?: string) => void
}

export type RequiredVarConfig = {
    description: string
    required: boolean
    value?: string
}

export async function parseEnvFile(envPath: string): Promise<Map<string, string>> {
    try {
        const content = await fs.readFile(envPath, 'utf-8')
        const lines = content.split('\n')
        const envMap = new Map<string, string>()

        for (const line of lines) {
            const match = line.match(/^([^=]+)=(.*)$/)
            if (match) {
                envMap.set(match[1].trim(), match[2].trim())
            }
        }
        return envMap
    } catch (err: any) {
        if (err.code === 'ENOENT') {
            return new Map()
        }
        throw err
    }
}

export async function updateEnvFile(envPath: string, requiredVars: Record<string, RequiredVarConfig>): Promise<void> {
    const existingEnv = await parseEnvFile(envPath)
    let fileContent = ''

    try {
        fileContent = await fs.readFile(envPath, 'utf-8')
    } catch (err: any) {
        if (err.code !== 'ENOENT') throw err
    }

    const missingVars: string[] = []
    let updatedContent = fileContent

    for (const [key, config] of Object.entries(requiredVars)) {
        if (!existingEnv.has(key)) {
            missingVars.push(key)
            if (updatedContent && !updatedContent.endsWith('\n')) {
                updatedContent += '\n'
            }
            updatedContent += `# ${config.description}\n`
            updatedContent += `${key}=${config.value || ''}\n`
        }
    }

    if (missingVars.length > 0) {
        await fs.writeFile(envPath, updatedContent)
    }
}
