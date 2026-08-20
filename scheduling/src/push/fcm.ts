import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getMessaging } from 'firebase-admin/messaging'
import { classifyFcmError, type PushSender, type SendResult } from './sender.js'

export interface FcmSender extends PushSender {
  sendToToken(token: string, message: {
    notification?: { title: string; body: string }
    data: Record<string, string>
  }): Promise<void>
}

/**
 * FCM 발송자. 자격증명이 없으면 null 을 돌려준다.
 *
 * 키가 없다고 서버가 뜨지 않아서는 안 된다 (설계 §5.5) — 편성·수업 기능은 푸시와
 * 무관하게 동작해야 하고, 푸시만 FCM_NOT_CONFIGURED 로 정직하게 실패하면 된다.
 */
export function createFcmSender(): FcmSender | null {
  const raw = process.env.FCM_SERVICE_ACCOUNT_JSON
  if (!raw || raw.trim() === '') return null

  if (getApps().length === 0) {
    initializeApp({ credential: cert(JSON.parse(raw)) })
  }
  const messaging = getMessaging()

  return {
    async send(tokens: string[], data: Record<string, string>): Promise<SendResult> {
      const result: SendResult = { okTokens: [], invalidTokens: [], failedTokens: [] }
      if (tokens.length === 0) return result

      // data-only 고우선순위. notification 필드를 넣으면 앱이 백그라운드일 때
      // 시스템이 알림을 대신 만들어 버려 전체화면 인텐트를 걸 수 없다 (설계 §6.4).
      const response = await messaging.sendEachForMulticast({
        tokens,
        data,
        android: { priority: 'high' },
      })

      response.responses.forEach((r, i) => {
        const token = tokens[i]!
        if (r.success) {
          result.okTokens.push(token)
          return
        }
        const code = r.error?.code ?? 'messaging/unknown'
        if (classifyFcmError(code) === 'invalid') {
          result.invalidTokens.push(token)
        } else {
          result.failedTokens.push(token)
        }
      })

      return result
    },

    async sendToToken(token: string, message: {
      notification?: { title: string; body: string }
      data: Record<string, string>
    }): Promise<void> {
      await messaging.send({
        token,
        notification: message.notification,
        data: message.data,
        android: { priority: 'high' },
      })
    },
  }
}
