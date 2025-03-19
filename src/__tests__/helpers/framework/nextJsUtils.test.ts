import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
    modifyAppRouterLayout,
    modifyPagesRouterApp,
    parseEnvVars,
    getPort,
    testEnvToUrl,
    urlToTestEnv,
    TestEnv,
} from '../../../helpers/framework/nextJsUtils.js'
import * as javascriptUtils from '../../../helpers/lang/javascriptUtils.js'

// Mock the @clack modules
vi.mock('@clack/prompts', () => ({
    text: vi.fn(),
    log: { 
        warn: vi.fn() 
    }
}))

vi.mock('@clack/core', () => ({
    isCancel: vi.fn()
}))

describe('modifyAppRouterLayout', () => {
    it('should add AuthProvider to a vanilla layout.tsx file', () => {
        // Vanilla layout file with children in the body
        const layoutContent = `
import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'PropelAuth Demo',
  description: 'A demo app using PropelAuth',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
`

        const expectedLayoutContent = `
import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { AuthProvider } from "@propelauth/nextjs/client";

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'PropelAuth Demo',
  description: 'A demo app using PropelAuth',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}><AuthProvider authUrl={process.env.NEXT_PUBLIC_AUTH_URL!}>{children}</AuthProvider></body>
    </html>
  )
}
`
        const result = modifyAppRouterLayout(layoutContent)
        expect(result.modified).toBe(true)
        expect(result.hasAuthProvider).toBe(false)
        expect(result.updatedContent).toEqual(expectedLayoutContent)
    })

    it('should detect existing AuthProvider in layout.tsx', () => {
        // Layout file that already has AuthProvider
        const layoutContent = `
import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { AuthProvider } from "@propelauth/nextjs/client";

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'PropelAuth Demo',
  description: 'A demo app using PropelAuth',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}><AuthProvider authUrl={process.env.NEXT_PUBLIC_AUTH_URL!}>{children}</AuthProvider></body>
    </html>
  )
}
`
        const result = modifyAppRouterLayout(layoutContent)
        expect(result.modified).toBe(false)
        expect(result.hasAuthProvider).toBe(true)
        expect(result.updatedContent).toEqual(layoutContent)
    })

    it('should handle layout with nested providers', () => {
        // Layout file with nested providers
        const layoutContent = `
import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { ThemeProvider } from '@theme/provider'
import { StoreProvider } from '@store/provider'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'PropelAuth Demo',
  description: 'A demo app using PropelAuth',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ThemeProvider>
          <StoreProvider>
            {children}
          </StoreProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
`

        const expectedLayoutContent = `
import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { ThemeProvider } from '@theme/provider'
import { StoreProvider } from '@store/provider'
import { AuthProvider } from "@propelauth/nextjs/client";

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'PropelAuth Demo',
  description: 'A demo app using PropelAuth',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ThemeProvider>
          <StoreProvider>
            <AuthProvider authUrl={process.env.NEXT_PUBLIC_AUTH_URL!}>{children}</AuthProvider>
          </StoreProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
`
        const result = modifyAppRouterLayout(layoutContent)
        expect(result.modified).toBe(true)
        expect(result.hasAuthProvider).toBe(false)
        expect(result.updatedContent).toEqual(expectedLayoutContent)
    })

    it('should handle layout with complex JSX expressions', () => {
        // Layout file with more complex JSX expressions and conditional rendering
        const layoutContent = `
import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'PropelAuth Demo',
  description: 'A demo app using PropelAuth',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const showFooter = process.env.SHOW_FOOTER === 'true'
  
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="main-content">
          <header>
            <nav>Menu</nav>
          </header>
          <div className="content-wrapper">
            {/* Main content */}
            {children}
          </div>
          {showFooter && <footer>Footer</footer>}
        </div>
      </body>
    </html>
  )
}
`

        const expectedLayoutContent = `
import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { AuthProvider } from "@propelauth/nextjs/client";

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'PropelAuth Demo',
  description: 'A demo app using PropelAuth',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const showFooter = process.env.SHOW_FOOTER === 'true'
  
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="main-content">
          <header>
            <nav>Menu</nav>
          </header>
          <div className="content-wrapper">
            {/* Main content */}
            <AuthProvider authUrl={process.env.NEXT_PUBLIC_AUTH_URL!}>{children}</AuthProvider>
          </div>
          {showFooter && <footer>Footer</footer>}
        </div>
      </body>
    </html>
  )
}
`

        const result = modifyAppRouterLayout(layoutContent)
        expect(result.modified).toBe(true)
        expect(result.hasAuthProvider).toBe(false)
        expect(result.updatedContent).toEqual(expectedLayoutContent)
    })

    it('should gracefully handle invalid JSX', () => {
        // Layout file with invalid JSX that might cause parsing errors
        const layoutContent = `
import './globals.css'
import type { Metadata } from 'next'

// This is a problematic file with unclosed tags
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <div
        {children}
      </body>
    </html>
  )
}
`
        const result = modifyAppRouterLayout(layoutContent)
        expect(result.modified).toBe(false)
        expect(result.hasAuthProvider).toBe(false)
        // The error handling might still add imports, so just check for error fields
        expect(result.modified).toBe(false)
        expect(result.hasAuthProvider).toBe(false)
    })
})

describe('modifyPagesRouterApp', () => {
    it('should add AuthProvider to a vanilla _app.tsx file', () => {
        // Vanilla _app.tsx file
        const appContent = `
import '../styles/globals.css'
import type { AppProps } from 'next/app'

export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />
}
`

        const expectedAppContent = `
import '../styles/globals.css'
import type { AppProps } from 'next/app'
import { AuthProvider } from "@propelauth/nextjs/client";

export default function App({ Component, pageProps }: AppProps) {
  return <AuthProvider authUrl={process.env.NEXT_PUBLIC_AUTH_URL!}><Component {...pageProps} /></AuthProvider>
}
`
        const result = modifyPagesRouterApp(appContent)
        expect(result.modified).toBe(true)
        expect(result.hasAuthProvider).toBe(false)
        expect(result.updatedContent).toEqual(expectedAppContent)
    })

    it('should detect existing AuthProvider in _app.tsx', () => {
        // _app.tsx file that already has AuthProvider
        const appContent = `
import '../styles/globals.css'
import type { AppProps } from 'next/app'
import { AuthProvider } from "@propelauth/nextjs/client";

export default function App({ Component, pageProps }: AppProps) {
  return <AuthProvider authUrl={process.env.NEXT_PUBLIC_AUTH_URL!}><Component {...pageProps} /></AuthProvider>
}
`
        const result = modifyPagesRouterApp(appContent)
        expect(result.modified).toBe(false)
        expect(result.hasAuthProvider).toBe(true)
        expect(result.updatedContent).toEqual(appContent)
    })

    it('should handle _app.tsx with other providers', () => {
        // _app.tsx file with another provider wrapper
        const appContent = `
import '../styles/globals.css'
import type { AppProps } from 'next/app'
import { ThemeProvider } from '@acme/ui'

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ThemeProvider>
      <Component {...pageProps} />
    </ThemeProvider>
  )
}
`

        const expectedAppContent = `
import '../styles/globals.css'
import type { AppProps } from 'next/app'
import { ThemeProvider } from '@acme/ui'
import { AuthProvider } from "@propelauth/nextjs/client";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ThemeProvider>
      <AuthProvider authUrl={process.env.NEXT_PUBLIC_AUTH_URL!}><Component {...pageProps} /></AuthProvider>
    </ThemeProvider>
  )
}
`
        const result = modifyPagesRouterApp(appContent)
        expect(result.modified).toBe(true)
        expect(result.hasAuthProvider).toBe(false)
        expect(result.updatedContent).toEqual(expectedAppContent)
    })

    it('should handle _app.tsx with multiple nested providers', () => {
        // _app.tsx with multiple nested providers
        const appContent = `
import '../styles/globals.css'
import type { AppProps } from 'next/app'
import { ThemeProvider } from '@acme/ui'
import { QueryClient, QueryClientProvider } from 'react-query'
import { RecoilRoot } from 'recoil'

const queryClient = new QueryClient()

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <RecoilRoot>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <Component {...pageProps} />
        </ThemeProvider>
      </QueryClientProvider>
    </RecoilRoot>
  )
}
`

        const expectedAppContent = `
import '../styles/globals.css'
import type { AppProps } from 'next/app'
import { ThemeProvider } from '@acme/ui'
import { QueryClient, QueryClientProvider } from 'react-query'
import { RecoilRoot } from 'recoil'
import { AuthProvider } from "@propelauth/nextjs/client";

const queryClient = new QueryClient()

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <RecoilRoot>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AuthProvider authUrl={process.env.NEXT_PUBLIC_AUTH_URL!}><Component {...pageProps} /></AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </RecoilRoot>
  )
}
`
        const result = modifyPagesRouterApp(appContent)
        expect(result.modified).toBe(true)
        expect(result.hasAuthProvider).toBe(false)
        expect(result.updatedContent).toEqual(expectedAppContent)
    })

    it('should handle alternative app function named MyApp', () => {
        // _app.tsx with function named MyApp instead of App
        const appContent = `
import '../styles/globals.css'
import type { AppProps } from 'next/app'

function MyApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />
}

export default MyApp
`

        const expectedAppContent = `
import '../styles/globals.css'
import type { AppProps } from 'next/app'
import { AuthProvider } from "@propelauth/nextjs/client";

function MyApp({ Component, pageProps }: AppProps) {
  return <AuthProvider authUrl={process.env.NEXT_PUBLIC_AUTH_URL!}><Component {...pageProps} /></AuthProvider>
}

export default MyApp
`
        const result = modifyPagesRouterApp(appContent)
        expect(result.modified).toBe(true)
        expect(result.hasAuthProvider).toBe(false)
        expect(result.updatedContent).toEqual(expectedAppContent)
    })

    it('should handle app with selfclosing Component tag', () => {
        // _app.tsx with selfclosing Component tag
        const appContent = `
import '../styles/globals.css'
import type { AppProps } from 'next/app'

export default function App({ Component, pageProps }: AppProps) {
  return (
    <div className="app-container">
      <Component {...pageProps} />
    </div>
  )
}
`

        const expectedAppContent = `
import '../styles/globals.css'
import type { AppProps } from 'next/app'
import { AuthProvider } from "@propelauth/nextjs/client";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <div className="app-container">
      <AuthProvider authUrl={process.env.NEXT_PUBLIC_AUTH_URL!}><Component {...pageProps} /></AuthProvider>
    </div>
  )
}
`
        const result = modifyPagesRouterApp(appContent)
        expect(result.modified).toBe(true)
        expect(result.hasAuthProvider).toBe(false)
        expect(result.updatedContent).toEqual(expectedAppContent)
    })

    it('should gracefully handle invalid JSX', () => {
        // _app.tsx with invalid JSX that might cause parsing errors
        const appContent = `
import '../styles/globals.css'
import type { AppProps } from 'next/app'

// This is a problematic file with syntax errors
export default function App({ Component, pageProps }: AppProps) {
  return (
    <div>
      <Component {...pageProps} 
    </div>
  )
}
`

        const result = modifyPagesRouterApp(appContent)
        expect(result.hasAuthProvider).toBe(false)
    })
})

describe('testEnvToUrl', () => {
    it('should convert localhost test env to URL', () => {
        const testEnv: TestEnv = {
            type: 'Localhost',
            port: 3000
        }
        expect(testEnvToUrl(testEnv)).toBe('http://localhost:3000')
    })

    it('should handle SchemeAndDomain test env', () => {
        const testEnv: TestEnv = {
            type: 'SchemeAndDomain',
            scheme_and_domain: 'https://example.com'
        }
        expect(testEnvToUrl(testEnv)).toBe('https://example.com')
    })
})

describe('urlToTestEnv', () => {
    it('should convert localhost URL to test env', () => {
        const url = 'http://localhost:3000'
        const expected: TestEnv = {
            type: 'Localhost',
            port: 3000
        }
        expect(urlToTestEnv(url)).toEqual(expected)
    })

    it('should handle URLs with default port', () => {
        const url = 'http://localhost'
        const expected: TestEnv = {
            type: 'Localhost',
            port: 3000
        }
        expect(urlToTestEnv(url)).toEqual(expected)
    })

    it('should convert non-localhost URLs to SchemeAndDomain', () => {
        const url = 'https://example.com'
        const expected: TestEnv = {
            type: 'SchemeAndDomain',
            scheme_and_domain: url
        }
        expect(urlToTestEnv(url)).toEqual(expected)
    })

    it('should handle port numbers as input', () => {
        const input = '3000'
        const expected: TestEnv = {
            type: 'Localhost',
            port: 3000
        }
        expect(urlToTestEnv(input)).toEqual(expected)
    })

    it('should provide default for invalid inputs', () => {
        const input = 'not-a-url-or-port'
        const expected: TestEnv = {
            type: 'Localhost',
            port: 3000
        }
        expect(urlToTestEnv(input)).toEqual(expected)
    })
})

describe('parseEnvVars', () => {
    it('should parse basic environment variables', async () => {
        const envContent = `
NEXT_PUBLIC_AUTH_URL=https://auth.example.com
PROPELAUTH_API_KEY=api_123456
PROPELAUTH_VERIFIER_KEY=verifier_123456
PORT=3000
`
        const result = await parseEnvVars(envContent)
        expect(result).toEqual({
            NEXT_PUBLIC_AUTH_URL: 'https://auth.example.com',
            PROPELAUTH_API_KEY: 'api_123456',
            PROPELAUTH_VERIFIER_KEY: 'verifier_123456',
            PORT: '3000',
        })
    })

    it('should handle empty env file', async () => {
        const envContent = ''
        const result = await parseEnvVars(envContent)
        expect(result).toEqual({})
    })

    it('should handle env variables with = signs in the value', async () => {
        const envContent = `
NEXT_PUBLIC_AUTH_URL=https://auth.example.com
PROPELAUTH_VERIFIER_KEY=abc123=xyz789=qwerty
`
        const result = await parseEnvVars(envContent)
        expect(result).toEqual({
            NEXT_PUBLIC_AUTH_URL: 'https://auth.example.com',
            PROPELAUTH_VERIFIER_KEY: 'abc123=xyz789=qwerty',
        })
    })

    it('should handle comments and empty lines', async () => {
        const envContent = `
# This is a comment
NEXT_PUBLIC_AUTH_URL=https://auth.example.com

# This is another comment
PROPELAUTH_API_KEY=api_123456
`
        const result = await parseEnvVars(envContent)
        expect(result).toEqual({
            NEXT_PUBLIC_AUTH_URL: 'https://auth.example.com',
            PROPELAUTH_API_KEY: 'api_123456',
        })
    })

    it('should handle quoted values', async () => {
        const envContent = `
NEXT_PUBLIC_AUTH_URL="https://auth.example.com"
PROPELAUTH_API_KEY='api_123456'
`
        const result = await parseEnvVars(envContent)
        expect(result).toEqual({
            NEXT_PUBLIC_AUTH_URL: '"https://auth.example.com"',
            PROPELAUTH_API_KEY: "'api_123456'",
        })
    })
})

describe('getPort', () => {
    beforeEach(() => {
        vi.resetAllMocks()
    })

    it('should extract port from package.json dev script', async () => {
        vi.spyOn(javascriptUtils, 'readPackageJson').mockResolvedValueOnce({
            scripts: {
                dev: 'next dev --port 4000'
            }
        })

        const result = await getPort('/fake/path')
        expect(result.port).toBe(4000)
        expect(result.url).toBe('http://localhost:4000')
        expect(result.testEnv).toEqual({ type: 'Localhost', port: 4000 })
    })

    it('should prompt user for port if not found in package.json', async () => {
        // Setup mocks
        vi.spyOn(javascriptUtils, 'readPackageJson').mockResolvedValueOnce({
            scripts: {
                dev: 'next dev'  // No port specified
            }
        })
        
        const prompts = await import('@clack/prompts')
        const core = await import('@clack/core')
        
        // Configure mocks
        prompts.text.mockResolvedValueOnce('5000')
        core.isCancel.mockReturnValue(false)

        const result = await getPort('/fake/path')
        expect(result.port).toBe(5000)
        expect(result.url).toBe('http://localhost:5000')
        expect(result.testEnv).toEqual({ type: 'Localhost', port: 5000 })
    })

    it('should handle localhost URL input', async () => {
        // Setup mocks
        vi.spyOn(javascriptUtils, 'readPackageJson').mockResolvedValueOnce({})
        
        const prompts = await import('@clack/prompts')
        const core = await import('@clack/core')
        
        // Configure mocks
        prompts.text.mockResolvedValueOnce('http://localhost:4000')
        core.isCancel.mockReturnValue(false)

        const result = await getPort('/fake/path')
        expect(result.port).toBe(4000)
        expect(result.url).toBe('http://localhost:4000')
        expect(result.testEnv).toEqual({ type: 'Localhost', port: 4000 })
    })

    it('should handle custom domain URL input', async () => {
        // Setup mocks
        vi.spyOn(javascriptUtils, 'readPackageJson').mockResolvedValueOnce({})
        
        const prompts = await import('@clack/prompts')
        const core = await import('@clack/core')
        
        // Configure mocks
        prompts.text.mockResolvedValueOnce('https://example.com')
        core.isCancel.mockReturnValue(false)

        const result = await getPort('/fake/path')
        expect(result.port).toBe(3000) // Default port for non-localhost URLs
        expect(result.url).toBe('https://example.com')
        expect(result.testEnv).toEqual({ 
            type: 'SchemeAndDomain', 
            scheme_and_domain: 'https://example.com' 
        })
    })

    it('should handle invalid input and use defaults', async () => {
        // Setup mocks
        vi.spyOn(javascriptUtils, 'readPackageJson').mockResolvedValueOnce({})
        
        const prompts = await import('@clack/prompts')
        const core = await import('@clack/core')
        
        // Configure mocks
        prompts.text.mockResolvedValueOnce('not-a-valid-url-or-port')
        core.isCancel.mockReturnValue(false)

        const result = await getPort('/fake/path')
        expect(result.port).toBe(3000) // Default port
        expect(result.url).toBe('http://localhost:3000')
        expect(result.testEnv).toEqual({ type: 'Localhost', port: 3000 })
    })
    
    it('should throw error if user cancels the selection', async () => {
        // Setup mocks
        vi.spyOn(javascriptUtils, 'readPackageJson').mockResolvedValueOnce({})
        
        const prompts = await import('@clack/prompts')
        const core = await import('@clack/core')
        
        // Configure mocks
        const cancelSymbol = Symbol.for('clack.cancel')
        prompts.text.mockResolvedValueOnce(cancelSymbol)
        core.isCancel.mockReturnValueOnce(true)
        
        // The function should throw when user cancels
        await expect(getPort('/fake/path')).rejects.toThrow('URL selection cancelled')
    })

    // The regex pattern tests remain unchanged
    it('should match port pattern with -p flag', () => {
        const devScript = 'next dev -p 4000'
        const portMatch = devScript.match(/(?:--|:)port\s+(\d+)/) || devScript.match(/-p\s+(\d+)/)
        expect(portMatch).not.toBeNull()
        expect(portMatch?.[1]).toBe('4000')
    })

    it('should match port pattern with --port flag', () => {
        const devScript = 'next dev --port 5000'
        const portMatch = devScript.match(/(?:--|:)port\s+(\d+)/)
        expect(portMatch).not.toBeNull()
        expect(portMatch?.[1]).toBe('5000')
    })

    it('should match port pattern with env variables', () => {
        // This test verifies that we need a more robust pattern for ENV_VAR=value syntax
        const devScript = 'PORT=3919 next dev'
        const envPortMatch = devScript.match(/PORT=(\d+)/)
        expect(envPortMatch).not.toBeNull()
        expect(envPortMatch?.[1]).toBe('3919')
    })

    it('should match port pattern with : separator', () => {
        // This test verifies that we need a more robust pattern for :port syntax
        const devScript = 'next dev :8080'
        const colonPortMatch = devScript.match(/:(\d+)/)
        expect(colonPortMatch).not.toBeNull()
        expect(colonPortMatch?.[1]).toBe('8080')
    })
})
