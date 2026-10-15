import type {
  MattermostUser,
  MattermostTeam,
  MattermostChannel,
  MattermostPost,
  ChannelPostsResponse,
  UserStatus,
  MattermostFileInfo,
  MattermostChannelMember,
  MattermostReaction
} from '../types/mattermost'

const RUNTIME_ENV_URL =
  (typeof window !== 'undefined' && (window as any).__MATTERGRAM_ENV__?.MATTERMOST_BASE_URL) || ''

const ENV_SERVER_URL = (
  RUNTIME_ENV_URL ||
  ((import.meta as any).env?.MATTERMOST_BASE_URL as string) ||
  ((import.meta as any).env?.VITE_MATTERMOST_BASE_URL as string) ||
  ''
).trim().replace(/\/+$/, '')

const RUNTIME_SHOW_URL =
  typeof window !== 'undefined' ? (window as any).__MATTERGRAM_ENV__?.SHOW_MATTERMOST_BASE_URL : undefined

export const SHOW_MATTERMOST_BASE_URL: boolean = (() => {
  if (RUNTIME_SHOW_URL !== undefined && RUNTIME_SHOW_URL !== null) {
    return RUNTIME_SHOW_URL !== false && RUNTIME_SHOW_URL !== 'false' && RUNTIME_SHOW_URL !== 0 && RUNTIME_SHOW_URL !== '0'
  }
  const envVal = ((import.meta as any).env?.SHOW_MATTERMOST_BASE_URL ?? (import.meta as any).env?.VITE_SHOW_MATTERMOST_BASE_URL)
  if (envVal !== undefined && envVal !== null && envVal !== '') {
    return envVal !== false && envVal !== 'false' && envVal !== 0 && envVal !== '0'
  }
  return true // DEFAULT is true
})()

const INITIAL_SERVER_URL = ENV_SERVER_URL || (localStorage.getItem('mattergram_base_url') || '').trim().replace(/\/+$/, '')

class MattermostApiService {
  private baseUrl: string = INITIAL_SERVER_URL
  private token: string | null = localStorage.getItem('mattergram_token') || null

  constructor() {
    if (ENV_SERVER_URL) {
      this.baseUrl = ENV_SERVER_URL
      localStorage.setItem('mattergram_base_url', ENV_SERVER_URL)
    } else {
      this.cleanBaseUrl()
    }
    if (this.token && typeof document !== 'undefined') {
      document.cookie = `mattergram_session=${this.token}; path=/; SameSite=Lax`
    }
  }

  public getBaseUrl(): string {
    return this.baseUrl || ENV_SERVER_URL || (localStorage.getItem('mattergram_base_url') || '').trim().replace(/\/+$/, '')
  }

  public isBaseUrlVisible(): boolean {
    return SHOW_MATTERMOST_BASE_URL
  }

  public setBaseUrl(url: string) {
    if (ENV_SERVER_URL) {
      this.baseUrl = ENV_SERVER_URL
      localStorage.setItem('mattergram_base_url', ENV_SERVER_URL)
      return
    }
    this.baseUrl = (url || '').trim().replace(/\/+$/, '')
    if (this.baseUrl) {
      localStorage.setItem('mattergram_base_url', this.baseUrl)
    }
  }

  private cleanBaseUrl() {
    this.baseUrl = this.baseUrl.trim().replace(/\/+$/, '')
  }

  public getToken(): string | null {
    return this.token
  }

  public setToken(token: string | null) {
    this.token = token
    if (token) {
      localStorage.setItem('mattergram_token', token)
      if (typeof document !== 'undefined') {
        document.cookie = `mattergram_session=${token}; path=/; SameSite=Lax`
      }
    } else {
      localStorage.removeItem('mattergram_token')
      if (typeof document !== 'undefined') {
        document.cookie = 'mattergram_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
      }
    }
  }

  private getHeaders(extraHeaders: Record<string, string> = {}): HeadersInit {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Mattermost-Server': this.baseUrl,
      ...extraHeaders
    }
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`
    }
    return headers
  }

  public resolveEndpoint(endpoint: string): string {
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
    // If in dev / browser environment, proxy handles /api/v4 directly to prevent CORS
    return cleanEndpoint
  }

  public async getClientConfig(): Promise<any> {
    return this.request('/api/v4/config/client?format=old')
  }

  public async request<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
    if (!this.baseUrl) {
      throw new Error('Mattermost server URL is not configured. Please set MATTERMOST_BASE_URL in your .env file.')
    }
    const url = this.resolveEndpoint(endpoint)
    const headers = this.getHeaders(options.headers as Record<string, string> || {})

    const res = await fetch(url, {
      ...options,
      headers
    })

    if (!res.ok) {
      let errorMsg = `API Error ${res.status}: ${res.statusText}`
      let errId = ''
      let detailedError = ''
      try {
        const errJson = await res.json()
        errorMsg = errJson.message || errJson.detailed_error || errorMsg
        errId = errJson.id || ''
        detailedError = errJson.detailed_error || ''
      } catch {
        // ignore json error
      }
      const err: any = new Error(errorMsg)
      err.id = errId
      err.statusCode = res.status
      err.detailedError = detailedError
      throw err
    }

    if (res.status === 204) {
      return {} as T
    }

    return res.json()
  }

  // --- Auth ---
  public async login(loginId: string, password: string): Promise<{ user: MattermostUser; token: string }> {
    if (!this.baseUrl) {
      throw new Error('Mattermost server URL is not configured. Please set MATTERMOST_BASE_URL in your .env file.')
    }
    const url = this.resolveEndpoint('/api/v4/users/login')
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Mattermost-Server': this.baseUrl
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        login_id: loginId,
        password: password
      })
    })

    if (!res.ok) {
      let errText = `Login failed (${res.status})`
      try {
        const errJson = await res.json()
        errText = errJson.message || errJson.detailed_error || errText
      } catch {}
      throw new Error(errText)
    }

    // Token comes in 'Token' header from Mattermost
    const token = res.headers.get('Token') || res.headers.get('token')
    if (!token) {
      throw new Error('Authentication token not received in response headers')
    }

    const user: MattermostUser = await res.json()
    this.setToken(token)
    return { user, token }
  }

  public async register(payload: {
    email: string
    username: string
    password: string
    first_name?: string
    last_name?: string
    nickname?: string
  }): Promise<MattermostUser> {
    if (!this.baseUrl) {
      throw new Error('Mattermost server URL is not configured. Please set MATTERMOST_BASE_URL in your .env file.')
    }
    const url = this.resolveEndpoint('/api/v4/users')
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Mattermost-Server': this.baseUrl
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    })

    if (!res.ok) {
      let errText = `Registration failed (${res.status})`
      try {
        const errJson = await res.json()
        errText = errJson.message || errJson.detailed_error || errText
      } catch {}
      throw new Error(errText)
    }

    return res.json()
  }

  public async logout(): Promise<void> {
    try {
      await this.request('/api/v4/users/logout', { method: 'POST' })
    } catch {
      // ignore
    } finally {
      this.setToken(null)
    }
  }

  public async getMe(): Promise<MattermostUser> {
    return this.request<MattermostUser>('/api/v4/users/me')
  }

  // --- Teams ---
  public async getMyTeams(): Promise<MattermostTeam[]> {
    return this.request<MattermostTeam[]>('/api/v4/users/me/teams')
  }

  public async getOpenTeams(): Promise<MattermostTeam[]> {
    return this.request<MattermostTeam[]>('/api/v4/teams')
  }

  public async addUserToTeam(teamId: string, userId: string): Promise<any> {
    return this.request(`/api/v4/teams/${teamId}/members`, {
      method: 'POST',
      body: JSON.stringify({
        team_id: teamId,
        user_id: userId
      })
    })
  }

  // --- Channels ---
  public async getMyChannels(teamId: string): Promise<MattermostChannel[]> {
    return this.request<MattermostChannel[]>(`/api/v4/users/me/teams/${teamId}/channels`)
  }

  public async getChannel(channelId: string): Promise<MattermostChannel> {
    return this.request<MattermostChannel>(`/api/v4/channels/${channelId}`)
  }

  public async createChannel(teamId: string, name: string, displayName: string, type: 'O' | 'P' = 'O', purpose: string = ''): Promise<MattermostChannel> {
    return this.request<MattermostChannel>('/api/v4/channels', {
      method: 'POST',
      body: JSON.stringify({
        team_id: teamId,
        name: name.toLowerCase().replace(/[^a-z0-9_-]/g, '-'),
        display_name: displayName,
        purpose,
        type
      })
    })
  }

  public async createDirectChannel(userId1: string, userId2: string): Promise<MattermostChannel> {
    return this.request<MattermostChannel>('/api/v4/channels/direct', {
      method: 'POST',
      body: JSON.stringify([userId1, userId2])
    })
  }

  public async deleteChannel(channelId: string): Promise<{ status: string }> {
    return this.request<{ status: string }>(`/api/v4/channels/${channelId}`, {
      method: 'DELETE'
    })
  }

  public async patchChannel(
    channelId: string,
    patch: Partial<{
      name: string
      display_name: string
      purpose: string
      header: string
      props: Record<string, any>
    }>
  ): Promise<MattermostChannel> {
    return this.request<MattermostChannel>(`/api/v4/channels/${channelId}/patch`, {
      method: 'PUT',
      body: JSON.stringify(patch)
    })
  }

  public async searchChannels(teamId: string, term: string): Promise<MattermostChannel[]> {
    return this.request<MattermostChannel[]>(`/api/v4/teams/${teamId}/channels/search`, {
      method: 'POST',
      body: JSON.stringify({ term })
    })
  }

  public async joinChannel(channelId: string, userId: string): Promise<any> {
    return this.addChannelMember(channelId, userId)
  }

  public async addChannelMember(channelId: string, userId: string): Promise<MattermostChannelMember> {
    return this.request<MattermostChannelMember>(`/api/v4/channels/${channelId}/members`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId })
    })
  }

  public async removeChannelMember(channelId: string, userId: string): Promise<{ status: string }> {
    return this.request<{ status: string }>(`/api/v4/channels/${channelId}/members/${userId}`, {
      method: 'DELETE'
    })
  }

  public async getChannelMember(channelId: string, userId: string): Promise<MattermostChannelMember> {
    return this.request<MattermostChannelMember>(`/api/v4/channels/${channelId}/members/${userId}`)
  }

  public async updateChannelMemberRoles(channelId: string, userId: string, roles: string): Promise<{ status: string }> {
    return this.request<{ status: string }>(`/api/v4/channels/${channelId}/members/${userId}/roles`, {
      method: 'PUT',
      body: JSON.stringify({ roles })
    })
  }

  public async updateChannelMemberSchemeRoles(
    channelId: string,
    userId: string,
    schemeRoles: { scheme_user: boolean; scheme_admin: boolean }
  ): Promise<{ status: string }> {
    return this.request<{ status: string }>(`/api/v4/channels/${channelId}/members/${userId}/schemeRoles`, {
      method: 'PUT',
      body: JSON.stringify(schemeRoles)
    })
  }

  public async setChannelMemberAdmin(channelId: string, userId: string, isAdmin: boolean): Promise<any> {
    try {
      return await this.updateChannelMemberSchemeRoles(channelId, userId, {
        scheme_user: true,
        scheme_admin: isAdmin
      })
    } catch {
      const roles = isAdmin ? 'channel_user channel_admin' : 'channel_user'
      return await this.updateChannelMemberRoles(channelId, userId, roles)
    }
  }

  public async getUsersNotInChannel(channelId: string, teamId?: string, page = 0, perPage = 60): Promise<MattermostUser[]> {
    const params = new URLSearchParams({
      not_in_channel: channelId,
      page: String(page),
      per_page: String(perPage)
    })
    if (teamId) params.set('in_team', teamId)
    return this.request<MattermostUser[]>(`/api/v4/users?${params.toString()}`)
  }

  public async getTeamUsers(teamId: string, page = 0, perPage = 60): Promise<MattermostUser[]> {
    return this.request<MattermostUser[]>(`/api/v4/users?in_team=${teamId}&page=${page}&per_page=${perPage}`)
  }

  public async getChannelMembers(channelId: string, page = 0, perPage = 100): Promise<MattermostChannelMember[]> {
    return this.request<MattermostChannelMember[]>(`/api/v4/channels/${channelId}/members?page=${page}&per_page=${perPage}`)
  }

  public async getMyChannelMembers(teamId: string): Promise<MattermostChannelMember[]> {
    return this.request<MattermostChannelMember[]>(`/api/v4/users/me/teams/${teamId}/channels/members`)
  }

  public async viewChannel(channelId: string, prevChannelId: string = ''): Promise<{ status: string }> {
    return this.request('/api/v4/channels/members/me/view', {
      method: 'POST',
      body: JSON.stringify({
        channel_id: channelId,
        prev_channel_id: prevChannelId
      })
    })
  }

  // --- Posts ---
  public async getPosts(channelId: string, page = 0, perPage = 60, before = ''): Promise<ChannelPostsResponse> {
    const params = new URLSearchParams()
    if (before) {
      params.set('before', before)
    } else {
      params.set('page', String(page))
    }
    params.set('per_page', String(perPage))
    return this.request<ChannelPostsResponse>(`/api/v4/channels/${channelId}/posts?${params.toString()}`)
  }

  public async getPost(postId: string): Promise<MattermostPost> {
    return this.request<MattermostPost>(`/api/v4/posts/${postId}`)
  }

  public async getPostsAround(channelId: string, postId: string, perPage = 60): Promise<ChannelPostsResponse> {
    return this.request<ChannelPostsResponse>(`/api/v4/channels/${channelId}/posts?around=${postId}&per_page=${perPage}`)
  }

  public async getPostThread(postId: string): Promise<ChannelPostsResponse> {
    return this.request<ChannelPostsResponse>(`/api/v4/posts/${postId}/thread`)
  }

  public async searchTeamPosts(
    teamId: string,
    terms: string,
    isOrSearch: boolean = false
  ): Promise<{ order: string[]; posts: Record<string, MattermostPost> }> {
    return this.request<{ order: string[]; posts: Record<string, MattermostPost> }>(
      `/api/v4/teams/${teamId}/posts/search`,
      {
        method: 'POST',
        body: JSON.stringify({
          terms,
          is_or_search: isOrSearch
        })
      }
    )
  }

  public async createPost(
    channelId: string,
    message: string,
    rootId = '',
    fileIds: string[] = [],
    props: Record<string, any> = {}
  ): Promise<MattermostPost> {
    const payload: Record<string, any> = {
      channel_id: channelId,
      message,
      root_id: rootId || '',
      file_ids: fileIds
    }
    if (props && Object.keys(props).length > 0) {
      payload.props = props
    }
    return this.request<MattermostPost>('/api/v4/posts', {
      method: 'POST',
      body: JSON.stringify(payload)
    })
  }

  public async editPost(postId: string, message: string): Promise<MattermostPost> {
    return this.request<MattermostPost>(`/api/v4/posts/${postId}/patch`, {
      method: 'PUT',
      body: JSON.stringify({ message })
    })
  }

  public async deletePost(postId: string): Promise<void> {
    await this.request(`/api/v4/posts/${postId}`, {
      method: 'DELETE'
    })
  }

  public async pinPost(postId: string): Promise<void> {
    await this.request(`/api/v4/posts/${postId}/pin`, {
      method: 'POST'
    })
  }

  public async unpinPost(postId: string): Promise<void> {
    await this.request(`/api/v4/posts/${postId}/unpin`, {
      method: 'POST'
    })
  }

  // --- Reactions ---
  public async addReaction(userId: string, postId: string, emojiName: string): Promise<void> {
    await this.request('/api/v4/reactions', {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        post_id: postId,
        emoji_name: emojiName
      })
    })
  }

  public async removeReaction(userId: string, postId: string, emojiName: string): Promise<void> {
    await this.request(`/api/v4/users/${userId}/posts/${postId}/reactions/${encodeURIComponent(emojiName)}`, {
      method: 'DELETE'
    })
  }

  public async getPostReactions(postId: string): Promise<MattermostReaction[]> {
    return this.request<MattermostReaction[]>(`/api/v4/posts/${postId}/reactions`)
  }

  // --- Users & Statuses ---
  public async getUser(userId: string): Promise<MattermostUser> {
    return this.request<MattermostUser>(`/api/v4/users/${userId}`)
  }

  public async getUserByUsername(username: string): Promise<MattermostUser> {
    return this.request<MattermostUser>(`/api/v4/users/username/${encodeURIComponent(username)}`)
  }

  public async getUsersByIds(userIds: string[]): Promise<MattermostUser[]> {
    if (!userIds.length) return []
    return this.request<MattermostUser[]>('/api/v4/users/ids', {
      method: 'POST',
      body: JSON.stringify(userIds)
    })
  }

  public async searchUsers(term: string, teamId?: string, notInChannelId?: string): Promise<MattermostUser[]> {
    const payload: any = { term }
    if (teamId) payload.team_id = teamId
    if (notInChannelId) payload.not_in_channel_id = notInChannelId
    return this.request<MattermostUser[]>('/api/v4/users/search', {
      method: 'POST',
      body: JSON.stringify(payload)
    })
  }

  public async getMyPreferences(): Promise<Array<{ user_id: string; category: string; name: string; value: string }>> {
    return this.request<Array<{ user_id: string; category: string; name: string; value: string }>>('/api/v4/users/me/preferences')
  }

  public async savePreferences(
    userId: string,
    preferences: Array<{ user_id: string; category: string; name: string; value: string }>
  ): Promise<{ status: string }> {
    return this.request<{ status: string }>(`/api/v4/users/${userId}/preferences`, {
      method: 'PUT',
      body: JSON.stringify(preferences)
    })
  }

  public async getUsersStatuses(userIds: string[]): Promise<UserStatus[]> {
    if (!userIds.length) return []
    return this.request<UserStatus[]>('/api/v4/users/status/ids', {
      method: 'POST',
      body: JSON.stringify(userIds)
    })
  }

  public async getUserStatus(userId: string): Promise<UserStatus> {
    return this.request<UserStatus>(`/api/v4/users/${userId}/status`)
  }

  public async updateUserCustomStatus(userId: string, status: 'online' | 'away' | 'dnd' | 'offline'): Promise<UserStatus> {
    return this.request<UserStatus>(`/api/v4/users/${userId}/status`, {
      method: 'PUT',
      body: JSON.stringify({
        user_id: userId,
        status
      })
    })
  }

  public async patchUser(
    userId: string,
    patch: Partial<{
      username: string
      email: string
      first_name: string
      last_name: string
      nickname: string
      position: string
      props: Record<string, any>
    }>
  ): Promise<MattermostUser> {
    return this.request<MattermostUser>(`/api/v4/users/${userId}/patch`, {
      method: 'PUT',
      body: JSON.stringify(patch)
    })
  }

  public async uploadProfileImage(userId: string, imageFile: File): Promise<any> {
    const formData = new FormData()
    formData.append('image', imageFile)

    const headers: Record<string, string> = {
      'X-Mattermost-Server': this.baseUrl
    }
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`
    }

    const res = await fetch(this.resolveEndpoint(`/api/v4/users/${userId}/image`), {
      method: 'POST',
      headers,
      body: formData
    })

    if (!res.ok) {
      let errMsg = `Upload profile image failed: ${res.statusText}`
      try {
        const errJson = await res.json()
        if (errJson.message) errMsg = errJson.message
      } catch {}
      throw new Error(errMsg)
    }

    return res.json().catch(() => ({ status: 'OK' }))
  }

  public async deleteProfileImage(userId: string): Promise<any> {
    return this.request(`/api/v4/users/${userId}/image`, {
      method: 'DELETE'
    })
  }

  public async updateUserPassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<{ status: string }> {
    return this.request<{ status: string }>(`/api/v4/users/${userId}/password`, {
      method: 'PUT',
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword
      })
    })
  }

  // --- Files ---
  public async uploadFile(channelId: string, file: File): Promise<MattermostFileInfo> {
    const formData = new FormData()
    formData.append('channel_id', channelId)
    formData.append('files', file)

    const headers: Record<string, string> = {
      'X-Mattermost-Server': this.baseUrl
    }
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`
    }

    const res = await fetch(this.resolveEndpoint('/api/v4/files'), {
      method: 'POST',
      headers,
      body: formData
    })

    if (!res.ok) {
      throw new Error(`Upload failed: ${res.statusText}`)
    }

    const data = await res.json()
    return data.file_infos[0]
  }

  public async getFileInfo(fileId: string): Promise<MattermostFileInfo> {
    return this.request<MattermostFileInfo>(`/api/v4/files/${fileId}/info`)
  }

  public async getPostFiles(postId: string): Promise<MattermostFileInfo[]> {
    return this.request<MattermostFileInfo[]>(`/api/v4/posts/${postId}/files/info`)
  }

  public getFileDownloadUrl(fileId: string): string {
    return `/api/v4/files/${fileId}`
  }

  public getFilePreviewUrl(fileId: string): string {
    return `/api/v4/files/${fileId}/preview`
  }

  public getFileThumbnailUrl(fileId: string): string {
    return `/api/v4/files/${fileId}/thumbnail`
  }

  public getUserAvatarUrl(userId: string, lastPictureUpdate?: number): string {
    const params = new URLSearchParams()
    if (lastPictureUpdate) params.set('_', String(lastPictureUpdate))
    const qs = params.toString() ? `?${params.toString()}` : ''
    return `/api/v4/users/${userId}/image${qs}`
  }

  // Mattermost Flagged Posts (Saved Messages) API
  public async getFlaggedPosts(userId: string, page = 0, perPage = 60): Promise<ChannelPostsResponse> {
    return this.request<ChannelPostsResponse>(`/api/v4/users/${userId}/posts/flagged?page=${page}&per_page=${perPage}`)
  }
}

export const mmApi = new MattermostApiService()
