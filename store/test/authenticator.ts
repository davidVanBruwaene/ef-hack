// A software passkey (ES256, "none" attestation) so the server can be tested without a browser.
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto'
import type { KeyObject } from 'node:crypto'

const sha = (b: string | Buffer): Buffer => createHash('sha256').update(b).digest()

// Minimal CBOR encoder for what WebAuthn needs.
function head(major: number, n: number): Buffer {
  if (n < 24) return Buffer.from([(major << 5) | n])
  if (n < 256) return Buffer.from([(major << 5) | 24, n])
  return Buffer.from([(major << 5) | 25, n >> 8, n & 255])
}
const cInt = (n: number): Buffer => (n >= 0 ? head(0, n) : head(1, -1 - n))
const cBytes = (b: Buffer): Buffer => Buffer.concat([head(2, b.length), b])
const cText = (s: string): Buffer => Buffer.concat([head(3, Buffer.byteLength(s)), Buffer.from(s)])
const cMap = (pairs: Buffer[][]): Buffer => Buffer.concat([head(5, pairs.length), ...pairs.flat()])

export interface CreationOptions {
  challenge: string
  rp: { id: string }
}
export interface RequestOptions {
  challenge: string
  rpId: string
}

export class SoftPasskey {
  privateKey: KeyObject
  jwk: { x?: string; y?: string }
  credId: Buffer
  counter: number

  constructor() {
    const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
    this.privateKey = privateKey
    this.jwk = publicKey.export({ format: 'jwk' })
    this.credId = randomBytes(32)
    this.counter = 0
  }

  get id(): string {
    return this.credId.toString('base64url')
  }

  create(options: CreationOptions, origin: string) {
    const clientDataJSON = Buffer.from(
      JSON.stringify({ type: 'webauthn.create', challenge: options.challenge, origin, crossOrigin: false }),
    )
    const cose = cMap([
      [cInt(1), cInt(2)],
      [cInt(3), cInt(-7)],
      [cInt(-1), cInt(1)],
      [cInt(-2), cBytes(Buffer.from(this.jwk.x!, 'base64url'))],
      [cInt(-3), cBytes(Buffer.from(this.jwk.y!, 'base64url'))],
    ])
    const counter = Buffer.alloc(4)
    const credLen = Buffer.from([0, this.credId.length])
    const authData = Buffer.concat([sha(options.rp.id), Buffer.from([0x45]), counter, Buffer.alloc(16), credLen, this.credId, cose])
    const attestationObject = cMap([
      [cText('fmt'), cText('none')],
      [cText('attStmt'), cMap([])],
      [cText('authData'), cBytes(authData)],
    ])
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key',
      response: {
        clientDataJSON: clientDataJSON.toString('base64url'),
        attestationObject: attestationObject.toString('base64url'),
        transports: ['internal'],
      },
      clientExtensionResults: {},
    }
  }

  get(options: RequestOptions, origin: string, userHandle?: string) {
    const clientDataJSON = Buffer.from(
      JSON.stringify({ type: 'webauthn.get', challenge: options.challenge, origin, crossOrigin: false }),
    )
    const counter = Buffer.alloc(4)
    counter.writeUInt32BE(++this.counter)
    const authData = Buffer.concat([sha(options.rpId), Buffer.from([0x05]), counter])
    const signature = sign('sha256', Buffer.concat([authData, sha(clientDataJSON)]), this.privateKey)
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key',
      response: {
        clientDataJSON: clientDataJSON.toString('base64url'),
        authenticatorData: authData.toString('base64url'),
        signature: signature.toString('base64url'),
        userHandle: userHandle ? Buffer.from(userHandle).toString('base64url') : undefined,
      },
      clientExtensionResults: {},
    }
  }
}
