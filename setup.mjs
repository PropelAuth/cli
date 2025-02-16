import { outro, text, password } from '@clack/prompts'
import { isCancel } from '@clack/core'
import { initBaseAuth } from '@propelauth/node'
import 'dotenv/config'

// TODO: replace with login and a personal API key
export async function setupAuth() {
    let authUrl = process.env.AUTH_URL
    if (!authUrl) {
        authUrl = await text({
            message: 'What is your auth URL?',
            placeholder: 'https://auth.example.com',
            validate(value) {
                if (value.length === 0) return `Auth URL is required!`
            },
        })
        if (isCancel(authUrl)) {
            outro('Ok, goodbye!')
            process.exit()
        }
    }

    let apiKey = process.env.API_KEY
    if (!apiKey) {
        apiKey = await password({
            message: 'What is your API key?',
            placeholder: 'your-api-key',
            validate(value) {
                if (value.length === 0) return `API key is required!`
            },
        })
        if (isCancel(apiKey)) {
            outro('Ok, goodbye!')
            process.exit()
        }
    }

    const auth = initBaseAuth({ authUrl, apiKey })
    return { auth, authUrl, apiKey }
}
