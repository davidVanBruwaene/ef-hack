import { useState } from 'react'
import { KeyRoundIcon, UserPlusIcon } from 'lucide-react'
import { register, signIn } from '@/auth'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [codes, setCodes] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function guard(fn: () => Promise<void>) {
    setError(null)
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center gap-4 px-4 py-10">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {codes ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Save your recovery codes</CardTitle>
            <CardDescription>Each code signs you in once if you lose your passkey. They are shown only now.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ul className="grid grid-cols-2 gap-2 font-mono text-sm">
              {codes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <Button className="self-start" onClick={onSignedIn}>
              Continue
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Sign in</CardTitle>
              <CardDescription>Use the passkey you made when you joined.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                disabled={busy}
                onClick={() =>
                  guard(async () => {
                    await signIn()
                    onSignedIn()
                  })
                }
              >
                <KeyRoundIcon className="size-4" />
                Sign in with a passkey
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">New here?</CardTitle>
              <CardDescription>Creating an account makes a passkey on this device.</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="flex flex-col gap-4"
                onSubmit={(e) => {
                  e.preventDefault()
                  guard(async () => setCodes(await register(first.trim(), last.trim())))
                }}
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="first-name">First name</Label>
                    <Input id="first-name" value={first} onChange={(e) => setFirst(e.target.value)} autoComplete="given-name" required />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="last-name">Last name</Label>
                    <Input id="last-name" value={last} onChange={(e) => setLast(e.target.value)} autoComplete="family-name" required />
                  </div>
                </div>
                <Button type="submit" variant="outline" className="self-start" disabled={busy}>
                  <UserPlusIcon className="size-4" />
                  Create account
                </Button>
              </form>
            </CardContent>
          </Card>
        </>
      )}
    </main>
  )
}
