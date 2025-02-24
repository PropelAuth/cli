import { ProjectsResponse } from './types/api.js'

const API_URL = 'https://api.propelauth.localhost/cli/projects'

export type FetchProjectsResult =
    | { success: true; data: ProjectsResponse }
    | { success: false; error: 'unauthorized' | string }

export async function fetchProjects(apiKey: string): Promise<FetchProjectsResult> {
    const response = await fetch(API_URL, {
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
    })

    if (response.status === 401) {
        return { success: false, error: 'unauthorized' }
    }

    if (!response.ok) {
        return { success: false, error: `Failed to fetch projects: ${response.statusText}` }
    }

    const data = (await response.json()) as ProjectsResponse
    return { success: true, data }
}
