export interface MattermostUser {
  id: string
  create_at: number
  update_at: number
  delete_at: number
  username: string
  auth_service: string
  email: string
  nickname: string
  first_name: string
  last_name: string
  position: string
  roles: string
  locale: string
  timezone?: {
    automaticTimezone: string
    manualTimezone: string
    useAutomaticTimezone: string
  }
}

export interface UserStatus {
  user_id: string
  status: 'online' | 'offline' | 'away' | 'dnd'
  manual?: boolean
  last_activity_at?: number
}

export interface MattermostTeam {
  id: string
  create_at: number
  update_at: number
  delete_at: number
  display_name: string
  name: string
  description: string
  email: string
  type: string
  company_name: string
  allowed_domains: string
  invite_id: string
  allow_open_invite: boolean
}

export interface MattermostChannel {
  id: string
  create_at: number
  update_at: number
  delete_at: number
  team_id: string
  type: 'O' | 'P' | 'D' | 'G' // Open, Private, Direct, Group
  display_name: string
  name: string
  header: string
  purpose: string
  last_post_at: number
  total_msg_count: number
  creator_id: string
  // Virtual fields for Telegram UI
  dm_user?: MattermostUser
  unread_count?: number
  is_pinned?: boolean
  is_muted?: boolean
  last_post?: MattermostPost
}

export interface MattermostChannelMember {
  channel_id: string
  user_id: string
  roles: string
  last_viewed_at: number
  msg_count: number
  mention_count: number
  notify_props: Record<string, any>
  last_update_at: number
  scheme_guest?: boolean
  scheme_user?: boolean
  scheme_admin?: boolean
  explicit_roles?: string
}

export interface MattermostFileInfo {
  id: string
  user_id: string
  post_id: string
  channel_id: string
  create_at: number
  update_at: number
  delete_at: number
  name: string
  extension: string
  size: number
  mime_type: string
  mini_preview?: string | null
  remote_id?: string
  width?: number
  height?: number
}

export interface MattermostReaction {
  user_id: string
  post_id: string
  emoji_name: string
  create_at: number
}

export interface MattermostPost {
  id: string
  create_at: number
  update_at: number
  edit_at: number
  delete_at: number
  is_pinned: boolean
  user_id: string
  channel_id: string
  root_id: string
  original_id: string
  message: string
  type: string
  props: Record<string, any>
  hashtags: string
  file_ids?: string[]
  pending_post_id?: string
  reply_count?: number
  last_reply_at?: number
  participants?: any[]
  metadata?: {
    files?: MattermostFileInfo[]
    reactions?: MattermostReaction[]
    emojis?: any[]
  }
}

export interface ChannelPostsResponse {
  order: string[]
  posts: Record<string, MattermostPost>
  next_post_id?: string
  prev_post_id?: string
}

export interface MattermostWebSocketEvent<T = any> {
  event: string
  data: T
  broadcast: {
    omit_users?: string[] | null
    user_id?: string
    channel_id?: string
    team_id?: string
    connection_id?: string
  }
  seq: number
}
