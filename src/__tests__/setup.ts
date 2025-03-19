import { vi } from 'vitest'

// This file contains setup code for tests

// Make sure global mocks are reset
// @ts-ignore - beforeEach is provided by vitest via globals: true
beforeEach(() => {
    vi.resetAllMocks()
})