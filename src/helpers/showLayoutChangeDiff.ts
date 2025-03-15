import { createTwoFilesPatch } from 'diff'
import pc from 'picocolors'

export function showLayoutChangeDiff(
    printer: (msg: string) => void,
    beforeSnippet: string,
    afterSnippet: string
): void {
    const patch = createTwoFilesPatch('layout.tsx', 'layout.tsx', beforeSnippet.trim(), afterSnippet.trim(), '', '')
    
    // Format the diff with colors
    const formattedPatch = patch
        .split('\n')
        .map(line => {
            if (line.startsWith('+')) return pc.green(line)
            if (line.startsWith('-')) return pc.red(line)
            if (line.startsWith('@')) return pc.cyan(line)
            if (line.startsWith('Index:') || line.startsWith('===')) return pc.magenta(line)
            return line
        })
        .join('\n')
    
    printer(formattedPatch)
}
