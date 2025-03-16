export interface ProjectsResponse {
    projects: ProjectResponse[]
}

export interface ProjectResponse {
    org_id: string // UUID
    org_name: string
    project_id: string // UUID
    name: string
    role: string // UsersRoleForPropelAuth
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

export interface TestEnvLocalhost {
    type: 'Localhost'
    port: number
}

export interface TestEnvSchemeAndDomain {
    type: 'SchemeAndDomain'
    scheme_and_domain: string
}

export type TestEnv = TestEnvLocalhost | TestEnvSchemeAndDomain

export interface FrontendIntegrationResponse {
    test: {
        auth_url_origin: string
        test_env: TestEnv | null
        login_redirect_path: string
        logout_redirect_path: string
    }
}

export interface FrontendIntegrationRequest {
    test_env: TestEnv | null
    login_redirect_path: string
    logout_redirect_path: string
}

export interface ApiKeyRequest {
    name: string
    read_only: boolean
}

export interface ApiKeyResponse extends ApiKey {}
