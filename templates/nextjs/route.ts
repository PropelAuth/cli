import { getRouteHandlers } from '@propelauth/nextjs/server/app-router'
import { NextRequest } from 'next/server'

const routeHandlers = getRouteHandlers({
    postLoginRedirectPathFn: (req: NextRequest) => {
        return '/'
    },
})

export const GET = routeHandlers.getRouteHandlerAsync
export const POST = routeHandlers.postRouteHandlerAsync
