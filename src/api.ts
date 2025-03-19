import { 
    ProjectsResponse, 
    BackendIntegrationResponse, 
    FrontendIntegrationResponse,
    FrontendIntegrationRequest,
    ApiKeyRequest,
    ApiKeyResponse
} from './types/api.js'

const BASE_API_URL = 'https://api.propelauth.localhost/cli'
const PROJECTS_URL = `${BASE_API_URL}/projects`

export type ApiResult<T> =
    | { success: true; data: T }
    | { success: false; error: 'unauthorized' | string }

export type FetchProjectsResult = ApiResult<ProjectsResponse>
export type BackendIntegrationResult = ApiResult<BackendIntegrationResponse>
export type FrontendIntegrationResult = ApiResult<FrontendIntegrationResponse>
export type UpdateFrontendIntegrationResult = ApiResult<{}>
export type CreateApiKeyResult = ApiResult<ApiKeyResponse>

async function makeApiRequest<T>(
    url: string, 
    apiKey: string, 
    method: 'GET' | 'POST' | 'PUT' = 'GET',
    body?: object
): Promise<ApiResult<T>> {
    try {
        const headers = {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        }

        const options: RequestInit = { 
            method,
            headers
        }

        if (body) {
            options.body = JSON.stringify(body)
        }

        const response = await fetch(url, options)

        if (response.status === 401) {
            return { success: false, error: 'unauthorized' }
        }

        if (!response.ok) {
            return { success: false, error: `API request failed: ${response.statusText}` }
        }

        // For 204 No Content responses, just return an empty object
        if (response.status === 204) {
            return { success: true, data: {} as T }
        }

        const data = await response.json() as T
        return { success: true, data }
    } catch (err) {
        return { success: false, error: `API request error: ${err}` }
    }
}

export async function fetchProjects(apiKey: string): Promise<FetchProjectsResult> {
    return makeApiRequest<ProjectsResponse>(PROJECTS_URL, apiKey)
}

export async function fetchBackendIntegration(
    apiKey: string, 
    orgId: string, 
    projectId: string
): Promise<BackendIntegrationResult> {
    const url = `${BASE_API_URL}/${orgId}/project/${projectId}/be_integration`
    return makeApiRequest<BackendIntegrationResponse>(url, apiKey)
}

export async function fetchFrontendIntegration(
    apiKey: string, 
    orgId: string, 
    projectId: string
): Promise<FrontendIntegrationResult> {
    const url = `${BASE_API_URL}/${orgId}/project/${projectId}/fe_integration`
    return makeApiRequest<FrontendIntegrationResponse>(url, apiKey)
}

export async function updateFrontendIntegration(
    apiKey: string, 
    orgId: string, 
    projectId: string,
    data: FrontendIntegrationRequest
): Promise<UpdateFrontendIntegrationResult> {
    const url = `${BASE_API_URL}/${orgId}/project/${projectId}/fe_integration`
    return makeApiRequest<{}>(url, apiKey, 'PUT', data)
}

export async function createApiKey(
    apiKey: string, 
    orgId: string, 
    projectId: string,
    data: ApiKeyRequest
): Promise<CreateApiKeyResult> {
    const url = `${BASE_API_URL}/${orgId}/project/${projectId}/be_integration/api_key`
    return makeApiRequest<ApiKeyResponse>(url, apiKey, 'POST', data)
}
