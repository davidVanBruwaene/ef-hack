// Passkey sign-in against the store, with the same calls as store/dev.
const MESSAGES: Record<string, string> = {
  unknown_credential: 'That passkey belongs to no Parley account, often one left from an account that was removed. Try another passkey, or one on your phone.',
}
async function post(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(MESSAGES[json.error] ?? json.error_description ?? `${path}: ${res.status}${json.error ? ` ${json.error}` : ''}`), { code: json.error })
  return json
}

export async function signIn(): Promise<void> {
  const options = (await post('/auth/login/options', {})) as PublicKeyCredentialRequestOptionsJSON
  const cred = await navigator.credentials.get({ publicKey: PublicKeyCredential.parseRequestOptionsFromJSON(options) })
  if (!(cred instanceof PublicKeyCredential)) throw new Error('No passkey was used')
  await post('/auth/login/verify', cred.toJSON())
}

// Resolves to the recovery codes, which the store returns only once.
// Throws an error with code name_in_use until separate is true.
export async function register(first_name: string, last_name: string, separate = false): Promise<string[]> {
  const options = (await post('/auth/register/options', { first_name, last_name, ...(separate ? { separate } : {}) })) as PublicKeyCredentialCreationOptionsJSON
  const cred = await navigator.credentials.create({ publicKey: PublicKeyCredential.parseCreationOptionsFromJSON(options) })
  if (!(cred instanceof PublicKeyCredential)) throw new Error('No passkey was created')
  const { recovery_codes } = (await post('/auth/register/verify', cred.toJSON())) as { recovery_codes?: string[] }
  return recovery_codes ?? []
}
