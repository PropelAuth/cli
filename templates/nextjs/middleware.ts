import { AuthHookResponse, buildAuthMiddleware, UserFromToken } from '@propelauth/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'

// Note: Before 2025-03-22, Next.js recommended adding authentication and authorization checks in middleware.
//
// At PropelAuth, we're honestly not big fans of Next middleware in general, given how hard it is to compose
// more than one, and quite frankly, relying on a regex matcher for when it runs feels a bit dubious.
//
// The examples in our docs and output from the CLI show how to use functions like
// getUserOrRedirect() in your server components / route handlers to protect your application,
// and that is the approach we typically recommend.
//
// That being said, below we have an example where you could use the `afterAuthHook` to reject requests
// that are unauthenticated. This can be valuable to reject unauthorized requests early in the request,
// but, you should always prefer protecting routes explicitly in your server components / route handlers,
// and reach out at support@propelauth.com with any questions you have!
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
