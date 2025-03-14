export interface ProjectsResponse {
    projects: ProjectResponse[]
}

export interface ProjectResponse {
    org_id: string      // UUID
    org_name: string
    project_id: string  // UUID
    name: string
    role: string        // UsersRoleForPropelAuth
}

export interface ApiKey {
    api_key: string
    api_key_id: string
    name?: string
    readonly: boolean
}

export interface BackendIntegrationResponse {
    test: {
        auth_url_origin: string
        verifier_key: string
        issuer: string
    }
}

export interface TestEnv {
    type: 'Localhost'
    port: number
}

export interface AllowedUrl {
    base_domain: string
    allow_any_subdomain_match: boolean
}

export interface AllowedUrls {
    allowed_urls: AllowedUrl[]
}

export interface FrontendIntegrationResponse {
    test: {
        auth_url_origin: string
        test_env: TestEnv | null
        login_redirect_path: string
        logout_redirect_path: string
        allowed_urls?: AllowedUrls
    }
}

export interface FrontendIntegrationRequest {
    test_env: TestEnv | null
    login_redirect_path: string
    logout_redirect_path: string
    allowed_urls?: AllowedUrls
}

export interface ApiKeyRequest {
    name: string
    read_only: boolean
}

export interface ApiKeyResponse extends ApiKey {}
