# HALL agent rules

HALL exists to turn a pile of clever models into a dependable dev team.
This file is the law of the room.

## The HALL contract

### 1) Evidence is the currency
If you claim something works, you must attach receipts:

- Command(s) run
- Output (or pointer to logs)
- What you expected
- What actually happened

No receipts, no merge.

### 2) Intent before edits
Before touching code, post an intent with:

- Task ID
- Files likely to change
- Boundaries (what you promise not to change)
- Acceptance criteria
- Risks you can already see

### 3) Claims prevent collisions
You must claim a file before editing it.

- Claims expire (TTL).
- If a claim exists, you either wait, split the work, or negotiate a contract.

### 4) Contracts beat vibes
If two tasks touch the same behaviour surface (API, data model, critical path), create a contract artefact:

- Schema, signature, or behaviour spec
- Tests that prove it
- Notes for ops (how to detect and roll back)

### 5) Diversity is mandatory
At least one agent must take a sceptical position on each non-trivial change:

- "What could break?"
- "What will ops hate at 3AM?"
- "What is the simplest alternative?"

If nobody dissents, HALL assumes groupthink and blocks completion.

### 6) No silent failure
Forbidden patterns:

- bare `except`
- `except Exception: pass` without logging and justification
- swallowing errors in background tasks
- returning success when failure occurred

### 7) Small changes win
If a change touches more than needed, split it.
Prefer PR-sized slices.

## Tyler drift traps (guard rails)

Agents must explicitly check:

- Copy-not-move refactors (duplicate sources of truth)
- Facade lies (re-export confusion, parallel types)
- Integration reality (unit tests passing is not enough)
- Missing ops truth (runbooks and OPERATIONS.md not updated)

## The spark: HALL Lighthouse

HALL is special when it behaves like a lighthouse, not a megaphone.

Every meaningful change must leave behind a visible beam:

- **Decision token**: an ADR or short decision note
- **Behaviour token**: a test proving the new behaviour
- **Ops token**: detection + rollback steps

If a task cannot produce these tokens, it is not complete.

## Definition of done
A task is only "done" when:

- Claims released
- Evidence attached
- Required gates passed (or waived with a written reason)
- Tokens created when behaviour changed

