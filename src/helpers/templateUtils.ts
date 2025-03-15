import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs/promises'

/**
 * Loads a template resource file using import.meta.url for ESM compatibility
 * @param templatePath - Path to the template file relative to the templates directory
 * @param baseUrl - The import.meta.url of the calling file
 * @returns The content of the template file as a string
 */
export async function loadTemplateResource(...templatePath: string[]): Promise<string> {
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = path.dirname(__filename)
    const fullPath = path.join(__dirname, '..', 'templates', ...templatePath)

    try {
        return await fs.readFile(fullPath, 'utf-8')
    } catch (error) {
        throw new Error(`Failed to load template resource: ${fullPath}. ${error}`)
    }
}
