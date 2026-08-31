<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Working conventions

Agreed with the project owner. These survive here rather than in a session, so
a fresh container inherits them.

### Naming

**No hyphens in names I create.** Underscores instead: `medosha_moderation_core.tar.gz`,
not `medosha-moderation-core.tar.gz`. This applies to delivered files and to
anything else newly named.

It does **not** apply to existing code: the repository is kebab-case throughout
(`price-exchange/`, `single-image-input.tsx`, the `product-images` bucket), and
renaming that would be a large change with real breakage risk for no benefit.
New source files follow the surrounding convention; new *deliverables* use
underscores.

### Delivering work

Push to `origin/main` and tell the owner to `git pull`. A tarball is the
fallback, not the default — the whole of one session's work was lost when the
container was reclaimed while the push was blocked by a missing GitHub App
installation.

When a tarball is needed, install instructions are numbered ORDERs: one action
each, a PowerShell block, and a short line underneath saying why it matters or
what goes wrong without it. No prose between them.

Guard against the empty match:

```powershell
$f = Get-ChildItem "$HOME\Downloads\medosha*.tar.gz" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($f) { tar -xzf $f.FullName --strip-components=1 } else { "No archive found" }
```

Without the `if`, a missing file makes `tar` read the next argument as the
archive name and report `Failed to open '--strip-components=1'`, which sends
somebody looking in the wrong place.

### Verifying

Every behavioural change gets a check, and every check gets mutation-tested:
deliberately break the code and confirm the check fails. A check that passes on
broken code is worse than none.

Two failure modes that have recurred here and are worth naming:

- **Matching an identifier that outlives the call.** A constant, an import line
  or a comment satisfies the regex while the call it describes is wrong. Assert
  on call syntax, and strip comments first.
- **A second copy elsewhere in the file.** One function loses a guard and the
  check still passes because a sibling function has the same line. Scope the
  check to the function.

Migrations are validated against real PostgreSQL 16 before delivery, not
reasoned about. Policies and constraints are exercised with a non-superuser
`authenticated` role and `set local request.jwt.claim.sub`.
