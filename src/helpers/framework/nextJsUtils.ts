import fs from 'fs/promises'
import path from 'path'
import pc from 'picocolors'
import { readPackageJson } from '../lang/javascriptUtils'

type Spinner = {
    start: (msg?: string) => void
    stop: (msg?: string) => void
}

export async function validateNextJsProject(
    targetPath: string,
    spinner?: Spinner
): Promise<{
    nextVersion: string | null
    appRouterDir: string | null
    pagesRouterDir: string | null
    isUsingSrcDir: boolean
}> {
    const s = spinner || { start: () => {}, stop: () => {} }
    s.start('Checking for Next.js project details...')

    let nextVersion: string | null = null
    let appRouterDir: string | null = null
    let pagesRouterDir: string | null = null

    try {
        const pkg = await readPackageJson(targetPath)
        nextVersion = pkg.dependencies?.next || pkg.devDependencies?.next || null
        if (!nextVersion) {
            s.stop(pc.yellow('Next.js not found in package.json, continuing anyway'))
        }
    } catch (err) {
        s.stop(pc.yellow('No package.json found or it was invalid, continuing anyway'))
    }

    const possibleAppDirs = [path.join(targetPath, 'app'), path.join(targetPath, 'src', 'app')]
    const possiblePagesDirs = [path.join(targetPath, 'pages'), path.join(targetPath, 'src', 'pages')]

    for (const dir of possibleAppDirs) {
        try {
            const stats = await fs.stat(dir)
            if (stats.isDirectory()) {
                appRouterDir = dir
                break
            }
        } catch {}
    }

    for (const dir of possiblePagesDirs) {
        try {
            const stats = await fs.stat(dir)
            if (stats.isDirectory()) {
                pagesRouterDir = dir
                break
            }
        } catch {}
    }

    const isUsingSrcDir = !!(appRouterDir?.includes('src') || pagesRouterDir?.includes('src'))

    s.stop(
        `Detected Next.js ${pc.green(nextVersion || '(unknown)')} 
     App Router: ${appRouterDir ? pc.cyan(path.relative(targetPath, appRouterDir)) : pc.yellow('not found')}
     Pages Router: ${pagesRouterDir ? pc.cyan(path.relative(targetPath, pagesRouterDir)) : pc.yellow('not found')}
    `
    )

    return {
        nextVersion,
        appRouterDir,
        pagesRouterDir,
        isUsingSrcDir,
    }
}
