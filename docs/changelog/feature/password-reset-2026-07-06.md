# Deploy-triggered admin password reset

## Summary

The admin dashboard password is stored as a bcrypt hash in the Postgres
`settings` table and set once through a first-run setup flow. There was no way
to recover from a forgotten password: bcrypt is one-way, there is no
reset/forgot flow, and on the Astropods platform there is no direct access to
the deployed database or container to clear the hash by hand. A locked-out
operator had no path back in.

This adds a recovery path that works with the only lever an operator does have
on a deployed instance: a redeploy with a changed input.

## Design

A new agent input, `PASSWORD_RESET_KEY`, drives a one-shot reset that runs at
server startup (after the database is initialized). The reset **clears** the
stored password rather than setting a new one, so no plaintext password ever
lives in deploy config — the next visit to the dashboard drops to the existing
first-run setup screen, where the operator chooses a fresh password.

The central design problem is that startup code runs on *every* container
start — crashes, scale-up, and redeploys — not just the deploy the operator
intends. A sticky boolean flag (`RESET_PASSWORD=true`) would therefore re-wipe
the password on the next restart after a new one was set, locking the operator
into a setup loop.

The fix is to make the trigger **self-consuming**, keyed on the input's
*value*. The last-acted-on value is recorded in the `settings` table (which
survives restarts), and the reset only fires when the current key differs from
the recorded one:

```ts
export async function maybeResetPasswordFromEnv(): Promise<void> {
  const key = process.env.PASSWORD_RESET_KEY?.trim();
  if (!key) return;                       // unset/empty -> never fires

  const consumed = await getSetting('password_reset_key_used');
  if (consumed === key) return;           // already acted on this value -> inert

  await clearPasswordHash();
  await setSetting('password_reset_key_used', key);
}
```

Consequences:

- **Fires exactly once per distinct value.** Restarts, scale-up, and redeploys
  that carry the *same* `PASSWORD_RESET_KEY` are inert — there is no flag to
  remember to turn off afterward.
- **Re-triggerable.** To reset again later, deploy with a *new* value.
- **Safe by default.** An empty/unset key does nothing, so normal deploys are
  unaffected.

The input is declared on the agent in `astropods.yml` with an empty default:

```yaml
agent:
  inputs:
    - name: PASSWORD_RESET_KEY
      datatype: string
      default: ""
```

This change also drops two `persistent: true` flags from the `knowledge` block
that the current spec schema rejects (provider-mode and volume-mounted stores
are persistent implicitly). They were unrelated to the reset itself but blocked
`ast spec validate` — and therefore deploy — so removing them is what makes the
recovery path actually deployable.

## Migration

Nothing is required for normal operation; `PASSWORD_RESET_KEY` defaults to empty
and the reset never fires.

To recover a lost password on a deployed instance:

1. Redeploy with a new, unique key value, e.g.
   `ast deploy memory-box --var PASSWORD_RESET_KEY=reset-2026-07-06`.
2. Open the dashboard — it now shows the first-run setup screen — and set a new
   password.

The key value can be left in place afterward; it will not fire again until
changed.
