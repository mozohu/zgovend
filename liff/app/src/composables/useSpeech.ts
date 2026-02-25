import { ref } from 'vue'

const speaking = ref(false)
const loading = ref(false)
let ws: WebSocket | null = null
let audio: HTMLAudioElement | null = null

function getWsUrl() {
  const loc = window.location
  const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${loc.host}/ws/tts`
}

function getAuthToken(): string {
  try {
    // @ts-ignore
    if (window.liff && window.liff.isLoggedIn()) {
      // @ts-ignore
      return window.liff.getAccessToken() || ''
    }
  } catch {}
  return ''
}

function connect(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    if (ws && ws.readyState === WebSocket.OPEN) { resolve(ws); return }

    const socket = new WebSocket(getWsUrl())
    socket.binaryType = 'arraybuffer'

    socket.onopen = () => {
      // Authenticate
      socket.send(JSON.stringify({ action: 'auth', token: getAuthToken() }))
    }

    socket.onmessage = (e) => {
      if (typeof e.data === 'string') {
        const msg = JSON.parse(e.data)
        if (msg.type === 'auth_ok') {
          ws = socket
          resolve(socket)
        } else if (msg.type === 'error' && !ws) {
          reject(new Error(msg.message))
        }
      }
    }

    socket.onerror = () => reject(new Error('WebSocket connection failed'))
    socket.onclose = () => { if (ws === socket) ws = null }

    setTimeout(() => reject(new Error('WebSocket timeout')), 10000)
  })
}

async function speakLines(lines: string[]) {
  if (speaking.value) { stop(); return }

  const text = lines.join('。')
  if (!text.trim()) return

  loading.value = true
  speaking.value = true

  try {
    const socket = await connect()

    const chunks: ArrayBuffer[] = []

    await new Promise<void>((resolve, reject) => {
      const handler = (e: MessageEvent) => {
        if (e.data instanceof ArrayBuffer) {
          chunks.push(e.data)
        } else if (typeof e.data === 'string') {
          const msg = JSON.parse(e.data)
          if (msg.type === 'start') {
            loading.value = false
          } else if (msg.type === 'end') {
            socket.removeEventListener('message', handler)
            resolve()
          } else if (msg.type === 'error') {
            socket.removeEventListener('message', handler)
            reject(new Error(msg.message))
          }
        }
      }
      socket.addEventListener('message', handler)
      socket.send(JSON.stringify({ action: 'speak', text }))
    })

    // Play collected mp3
    const blob = new Blob(chunks, { type: 'audio/mpeg' })
    const url = URL.createObjectURL(blob)
    audio = new Audio(url)
    audio.onended = () => {
      speaking.value = false
      URL.revokeObjectURL(url)
    }
    audio.onerror = () => {
      speaking.value = false
      URL.revokeObjectURL(url)
    }
    await audio.play()
  } catch (e: any) {
    console.error('[useSpeech]', e)
    alert(`語音播報失敗: ${e.message}`)
    speaking.value = false
    loading.value = false
  }
}

function stop() {
  if (audio) {
    audio.pause()
    audio = null
  }
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ action: 'stop' }))
  }
  speaking.value = false
  loading.value = false
}

export function useSpeech() {
  return { speaking, loading, speakLines, stop }
}
