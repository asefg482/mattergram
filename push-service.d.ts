import type { IncomingMessage, ServerResponse } from 'http'

export interface InitPushOptions {
  rootDir?: string
  defaultServer?: string
  allowedServers?: Set<string>
  secureTls?: boolean
}

export function initPushService(options?: InitPushOptions): void
export function getVapidPublicKey(): string
export function handlePushApiRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean>
