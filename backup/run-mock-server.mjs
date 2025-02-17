import http from 'http'
import { initAuthByFetchingConfig } from '@propelauth/backend-js-utilities'
import { setupAuth } from './setup.mjs'

// TODO: replace with login and a personal API key
async function runMockServer(port) {
    const { authUrl, apiKey } = await setupAuth()
    const propelAuth = await initAuthByFetchingConfig({
        authUrl,
        integrationApiKey: apiKey,
        redirectUri: `http://localhost:${port}/api/auth/callback`,
    })

    const loginHandler = async (req, res) => {
        try {
            const { authorizeUrl, state } = propelAuth.user.redirectToSignupOrLogin(false)
            res.setHeader('Set-Cookie', `__pa_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/`)
            res.writeHead(302, { Location: authorizeUrl })
            res.end()
        } catch (error) {
            console.error('Login error:', error)
            res.writeHead(500)
            res.end('An error occurred during login')
        }
    }

    const signupHandler = async (req, res) => {
        try {
            const { authorizeUrl, state } = propelAuth.user.redirectToSignupOrLogin(true)
            res.setHeader('Set-Cookie', `__pa_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/`)
            res.writeHead(302, { Location: authorizeUrl })
            res.end()
        } catch (error) {
            console.error('Signup error:', error)
            res.writeHead(500)
            res.end('An error occurred during signup')
        }
    }

    const callbackHandler = async (req, res) => {
        const stateCookie = req.headers.cookie.split('; ').find((cookie) => cookie.startsWith('__pa_state='))
        if (!stateCookie) {
            res.writeHead(302, { Location: '/api/auth/login' })
            res.end()
            return
        }
        const stateFromCookie = stateCookie.split('=')[1]

        const url = new URL(`http://localhost:${port}${req.url}`)
        const searchParams = new URLSearchParams(url.search)
        const stateFromQueryParams = searchParams.get('state')
        const codeFromQueryParams = searchParams.get('code')
        if (!stateFromQueryParams) {
            console.log('No state in query params')
            res.writeHead(302, { Location: '/api/auth/login' })
            res.end()
            return
        } else if (!codeFromQueryParams) {
            console.log('No code in query params')
            res.writeHead(302, { Location: '/api/auth/login' })
            res.end()
            return
        }

        const response = await propelAuth.user.finishLogin({
            stateFromCookie,
            stateFromQueryParams,
            codeFromQueryParams,
        })
        if (response.error) {
            console.log('Callback error', response.error_type)
            res.writeHead(500)
            res.end('An error occurred, check the server logs for more information.')
            return
        }

        const { accessToken, refreshToken } = response
        res.setHeader('Set-Cookie', `__pa_at=${accessToken}; HttpOnly; Secure; SameSite=Lax; Path=/`)
        res.setHeader('Set-Cookie', `__pa_rt=${refreshToken}; HttpOnly; Secure; SameSite=Lax; Path=/`)
        res.writeHead(302, { Location: '/' })
        res.end()
    }

    const server = http.createServer(async (req, res) => {
        const url = new URL(`http://localhost:${port}${req.url}`)
        const path = url.pathname

        if (path === '/api/auth/login' && req.method === 'GET') {
            await loginHandler(req, res)
        } else if (path === '/api/auth/signup' && req.method === 'GET') {
            await signupHandler(req, res)
        } else if (path === '/api/auth/callback' && req.method === 'GET') {
            await callbackHandler(req, res)
        } else {
            res.writeHead(404)
            res.end()
        }
    })

    server.listen(port, () => {
        console.log(`Mock server running on http://localhost:${port}`)
    })
}

export default runMockServer
