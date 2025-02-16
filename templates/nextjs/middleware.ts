import { authMiddleware } from '@propelauth/nextjs/server/app-router'

export const middleware = authMiddleware

export const config = {
    matcher: [
        // REQUIRED: Match all request paths that start with /api/auth/
        '/api/auth/(.*)',
        // OPTIONAL: Exclude static assets from rewriting
        '/((?!_next/static|_next/image|favicon.ico).*)',
    ],
}
