import { SelectPrompt } from '@clack/core'
import color from 'picocolors'
import isUnicodeSupported from 'is-unicode-supported'

const unicode = isUnicodeSupported()
const s = (c, fallback) => (unicode ? c : fallback)
const S_STEP_ACTIVE = s('◆', '*')
const S_STEP_CANCEL = s('■', 'x')
const S_STEP_ERROR = s('▲', 'x')
const S_STEP_SUBMIT = s('◇', 'o')

const S_BAR = s('│', '|')
const S_BAR_END = s('└', '—')

const S_RADIO_ACTIVE = s('●', '>')
const S_RADIO_INACTIVE = s('○', ' ')

const symbol = (state) => {
    switch (state) {
        case 'initial':
        case 'active':
            return color.cyan(S_STEP_ACTIVE)
        case 'cancel':
            return color.red(S_STEP_CANCEL)
        case 'error':
            return color.yellow(S_STEP_ERROR)
        case 'submit':
            return color.green(S_STEP_SUBMIT)
    }
}

const limitOptions = (params) => {
    const { cursor, options, style } = params

    const paramMaxItems = params.maxItems ?? Infinity
    const outputMaxItems = Math.max(process.stdout.rows - 4, 0)
    // We clamp to minimum 5 because anything less doesn't make sense UX wise
    const maxItems = Math.min(outputMaxItems, Math.max(paramMaxItems, 5))
    let slidingWindowLocation = 0

    if (cursor >= slidingWindowLocation + maxItems - 3) {
        slidingWindowLocation = Math.max(Math.min(cursor - maxItems + 3, options.length - maxItems), 0)
    } else if (cursor < slidingWindowLocation + 2) {
        slidingWindowLocation = Math.max(cursor - 2, 0)
    }

    const shouldRenderTopEllipsis = maxItems < options.length && slidingWindowLocation > 0
    const shouldRenderBottomEllipsis = maxItems < options.length && slidingWindowLocation + maxItems < options.length

    return options.slice(slidingWindowLocation, slidingWindowLocation + maxItems).map((option, i, arr) => {
        const isTopLimit = i === 0 && shouldRenderTopEllipsis
        const isBottomLimit = i === arr.length - 1 && shouldRenderBottomEllipsis
        return isTopLimit || isBottomLimit ? color.dim('...') : style(option, i + slidingWindowLocation === cursor)
    })
}

const opt = (option, state) => {
    const label = option.label ?? String(option.value)
    switch (state) {
        case 'selected':
            return `${color.dim(label)}`
        case 'active':
            return `${color.green(S_RADIO_ACTIVE)} ${label} ${option.hint ? color.dim(`(${option.hint})`) : ''}`
        case 'cancelled':
            return `${color.strikethrough(color.dim(label))}`
        default:
            return `${color.dim(S_RADIO_INACTIVE)} ${color.dim(label)}`
    }
}

export const createAutoCompletePrompt = ({ options, header, maxItems, noItemsFoundLabel, fetchNewOptions }) => {
    const cache = {}
    const prompt = new SelectPrompt({
        options,
        render() {
            const title = `${color.gray(S_BAR)}\n${symbol(this.state)}  ${header}\n${this.query}\n\n`

            switch (this.state) {
                case 'submit':
                    return `${title}${color.gray(S_BAR)}  ${opt(this.options[this.cursor], 'selected')}`
                case 'cancel':
                    return `${title}${color.gray(S_BAR)}  ${opt(
                        this.options[this.cursor],
                        'cancelled'
                    )}\n${color.gray(S_BAR)}`
                default: {
                    return `${title}${color.cyan(S_BAR)}  ${limitOptions({
                        cursor: this.cursor,
                        options: this.options,
                        maxItems: maxItems || 7,
                        style: (item, active) => opt(item, active ? 'active' : 'inactive'),
                    }).join(`\n${color.cyan(S_BAR)}  `)}\n${color.cyan(S_BAR_END)}\n`
                }
            }
        },
    })
    prompt.query = ''
    prompt.on('key', (key) => {
        const code = key.charCodeAt()
        let shouldRerender = false
        if (code === 127) {
            prompt.query = prompt.query.slice(0, -1)
            shouldRerender = true
        } else if (code >= 32 && code <= 126) {
            prompt.query += key
            shouldRerender = true
        }

        if (shouldRerender) {
            const currentVal = prompt.value
            const query = prompt.query

            const existingOptions = cache[query]
            if (existingOptions !== undefined) {
                if (existingOptions.length === 0) {
                    prompt.options = [{ label: noItemsFoundLabel, value: '' }]
                } else {
                    prompt.options = existingOptions
                }
                prompt.cursor = prompt.options.findIndex((option) => option.value === currentVal)
                if (prompt.cursor === -1) {
                    prompt.cursor = 0
                }
                prompt.value = prompt.options[prompt.cursor].value
                prompt.render()
            }

            fetchNewOptions(query).then((options) => {
                cache[query] = options
                if (options.length === 0) {
                    prompt.options = [{ label: noItemsFoundLabel, value: '' }]
                } else {
                    prompt.options = options
                }
                prompt.cursor = prompt.options.findIndex((option) => option.value === currentVal)
                if (prompt.cursor === -1) {
                    prompt.cursor = 0
                }
                prompt.value = prompt.options[prompt.cursor].value
                prompt.render()
            })
        }
    })

    return prompt
}
