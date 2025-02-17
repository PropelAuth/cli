import { spinner, intro, outro } from '@clack/prompts'
import { isCancel } from '@clack/core'
import 'dotenv/config'
import { createAutoCompletePrompt } from './autocomplete.mjs'
import { setupAuth } from './setup.mjs'

export default async function generateAccessToken({ email, userId }) {
    if (email && userId) {
        console.error('Please provide either an email or a user ID, not both.')
        process.exit(1)
    }

    intro(`Generating an access token`)

    const { auth } = await setupAuth()

    let userIdToUse
    if (email) {
        const user = await auth.fetchUserMetadataByEmail(email)
        if (!user) {
            console.error(`User with email ${email} not found`)
            process.exit(1)
        }
        userIdToUse = user.userId
    } else if (userId) {
        userIdToUse = userId
    } else {
        const users = await auth.fetchUsersByQuery({
            emailOrUsername: '',
            pageSize: 100,
        })
        const emails = users.users.map((user) => user.email)

        const emailToUserId = {}
        for (const user of users.users) {
            emailToUserId[user.email] = user.userId
        }

        const prompt = createAutoCompletePrompt({
            options: emails.map((email) => {
                return {
                    label: email,
                    value: email,
                }
            }),
            header: 'Enter the email address to generate an access token for:',
            maxItems: 7,
            noItemsFoundLabel: 'No users found',
            fetchNewOptions: async (query) => {
                return auth.fetchUsersByQuery({ emailOrUsername: query, pageSize: 100 }).then((users) => {
                    for (const user of users.users) {
                        emailToUserId[user.email] = user.userId
                    }
                    return users.users.map((user) => {
                        return {
                            label: user.email,
                            value: user.email,
                        }
                    })
                })
            },
        })

        const email = await prompt.prompt()

        if (isCancel(email) || email.length === 0) {
            outro('Ok, goodbye!')
            process.exit()
        }

        userIdToUse = emailToUserId[email]
    }

    const loader = spinner()
    loader.start(`Generating access token"...`)
    auth.createAccessToken({ userId: userIdToUse, durationInMinutes: 60 })
        .catch((err) => {
            loader.stop()
            outro(`Unable to generate token for user: ${err.message}`)
        })
        .then((accessToken) => {
            loader.stop()
            outro(`Token: ${accessToken.access_token}`)
        })
}
