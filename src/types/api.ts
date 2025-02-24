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
