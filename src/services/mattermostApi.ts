import type {
  MattermostUser,
  MattermostTeam,
  MattermostChannel,
  MattermostPost,
  ChannelPostsResponse,
  UserStatus,
  MattermostFileInfo
} from '../types/mattermost'

const DEFAULT_SERVER_URL = 'https://m.dornicadev.ir'

class MattermostApiService {
  private baseUrl: string = localStorage.getItem('mattergram_base_url') || DEFAULT_SERVER_URL
  private token: string | null = localStorage.getItem('mattergram_token') || null

  constructor() {
    this.cleanBaseUrl()
  }

  public getBaseUrl(): string {
    return this.baseUrl
  }

  public setBaseUrl(url: string) {
    this.baseUrl = url.trim().replace(/\/+$/, '')
    localStorage.setItem('mattergram_base_url', this.baseUrl)
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
    } else {
      localStorage.removeItem('mattergram_token')
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

  private resolveEndpoint(endpoint: string): string {
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
    // If in dev / browser environment, proxy handles /api/v4 directly to prevent CORS
    return cleanEndpoint
  }

  public async request<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = this.resolveEndpoint(endpoint)
    const headers = this.getHeaders(options.headers as Record<string, string> || {})

    const res = await fetch(url, {
      ...options,
      headers
    })

    if (!res.ok) {
      let errorMsg = `API Error ${res.status}: ${res.statusText}`
      try {
        const errJson = await res.json()
        errorMsg = errJson.message || errJson.detailed_error || errorMsg
      } catch {
        // ignore json error
      }
      throw new Error(errorMsg)
    }

    if (res.status === 204) {
      return {} as T
    }

    return res.json()
  }

  // --- Auth ---
  public async login(loginId: string, password: string): Promise<{ user: MattermostUser; token: string }> {
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

  public async searchChannels(teamId: string, term: string): Promise<MattermostChannel[]> {
    return this.request<MattermostChannel[]>(`/api/v4/teams/${teamId}/channels/search`, {
      method: 'POST',
      body: JSON.stringify({ term })
    })
  }

  public async joinChannel(channelId: string, userId: string): Promise<any> {
    return this.request(`/api/v4/channels/${channelId}/members`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId })
    })
  }

  public async getChannelMembers(channelId: string, page = 0, perPage = 100): Promise<any[]> {
    return this.request<any[]>(`/api/v4/channels/${channelId}/members?page=${page}&per_page=${perPage}`)
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
  public async getPosts(channelId: string, page = 0, perPage = 60): Promise<ChannelPostsResponse> {
    return this.request<ChannelPostsResponse>(`/api/v4/channels/${channelId}/posts?page=${page}&per_page=${perPage}`)
  }

  public async getPost(postId: string): Promise<MattermostPost> {
    return this.request<MattermostPost>(`/api/v4/posts/${postId}`)
  }

  public async createPost(channelId: string, message: string, rootId = '', fileIds: string[] = []): Promise<MattermostPost> {
    return this.request<MattermostPost>('/api/v4/posts', {
      method: 'POST',
      body: JSON.stringify({
        channel_id: channelId,
        message,
        root_id: rootId,
        file_ids: fileIds
      })
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

  public async searchUsers(term: string, teamId?: string): Promise<MattermostUser[]> {
    const payload: any = { term }
    if (teamId) payload.team_id = teamId
    return this.request<MattermostUser[]>('/api/v4/users/search', {
      method: 'POST',
      body: JSON.stringify(payload)
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

  public getFileDownloadUrl(fileId: string): string {
    const params = new URLSearchParams()
    if (this.token) params.set('mattergram_token', this.token)
    if (this.baseUrl) params.set('mattergram_server', this.baseUrl)
    const qs = params.toString() ? `?${params.toString()}` : ''
    return `/api/v4/files/${fileId}${qs}`
  }

  public getFilePreviewUrl(fileId: string): string {
    const params = new URLSearchParams()
    if (this.token) params.set('mattergram_token', this.token)
    if (this.baseUrl) params.set('mattergram_server', this.baseUrl)
    const qs = params.toString() ? `?${params.toString()}` : ''
    return `/api/v4/files/${fileId}/preview${qs}`
  }

  public getFileThumbnailUrl(fileId: string): string {
    const params = new URLSearchParams()
    if (this.token) params.set('mattergram_token', this.token)
    if (this.baseUrl) params.set('mattergram_server', this.baseUrl)
    const qs = params.toString() ? `?${params.toString()}` : ''
    return `/api/v4/files/${fileId}/thumbnail${qs}`
  }

  public getUserAvatarUrl(userId: string, lastPictureUpdate?: number): string {
    const params = new URLSearchParams()
    if (this.token) params.set('mattergram_token', this.token)
    if (this.baseUrl) params.set('mattergram_server', this.baseUrl)
    if (lastPictureUpdate) params.set('_', String(lastPictureUpdate))
    const qs = params.toString() ? `?${params.toString()}` : ''
    return `/api/v4/users/${userId}/image${qs}`
  }
}

export const mmApi = new MattermostApiService()
