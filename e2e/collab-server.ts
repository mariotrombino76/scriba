// Collaboration server for the e2e tests (port 4174). Test users only.
import { listenCollabServer } from '@scriba-editor/collab-server'

const USERS: Record<string, { id: string; name: string; canWrite: boolean }> = {
  'tok-anna': { id: 'u1', name: 'Anna', canWrite: true },
  'tok-bruno': { id: 'u2', name: 'Bruno', canWrite: true },
  'tok-ospite': { id: 'u3', name: 'Ospite', canWrite: false },
}

listenCollabServer({
  port: 4174,
  authenticate: (token) => {
    const u = USERS[token]
    return u ? { user: { id: u.id, name: u.name }, canWrite: u.canWrite } : null
  },
})
console.log('collab server on ws://localhost:4174')
