import { createTwoFilesPatch } from 'diff'
import pc from 'picocolors'

export function showLayoutChangeDiff(
    printer: (msg: string) => void,
    beforeSnippet: string,
    afterSnippet: string
): void {
    const patch = createTwoFilesPatch('before', 'after', beforeSnippet.trim(), afterSnippet.trim(), '', '')
    printer(pc.magenta(patch))
}
