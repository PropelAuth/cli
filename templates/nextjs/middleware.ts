import { AuthHookResponse, buildAuthMiddleware, UserFromToken } from '@propelauth/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'

export const middleware = buildAuthMiddleware({
    afterAuthHook: async (req: NextRequest, res: NextResponse, user?: UserFromToken) => {
        if (!user && isProtectedRoute(req.nextUrl.pathname)) {
            return AuthHookResponse.reject(new NextResponse(undefined, { status: 401 }))
        } else {
            return AuthHookResponse.continue()
        }
    },
})

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const isProtectedRoute = (_path: string) => {
    // compare with regex or a list, really whatever
    return false
}

export const config = {
    matcher: [
        // REQUIRED: Match all request paths that start with /api/auth/
        '/api/auth/(.*)',
        // OPTIONAL: Exclude static assets
        '/((?!_next/static|_next/image|favicon.ico).*)',
        // TODO: Add any other paths that should be protected
    ],
}
