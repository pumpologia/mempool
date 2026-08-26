# Pumpologia explorer UI/UX mega goal

## Product intent

Pumpologia is a trading journal backed by verifiable Bitcoin execution. The interface must make the protocol state legible first, then let a curious user reveal the underlying chain proof progressively. It keeps the mature Mempool explorer structure, routes and data flow while giving every Pumpologia surface one editorial, calm and highly recognisable visual language.

## Non-negotiable invariants

- Keep every existing public route and deep link working.
- Keep the block carousel, blocks and native transaction visualisation available.
- Do not change indexer semantics in presentation code.
- Do not expose raw indexer payloads, owner scripts, internal identifiers, health endpoints or unrestricted JSON.
- Treat the Mempool transaction and UTXO data as the verifiable substrate, never as duplicate protocol state.
- Add new UI incrementally so each production release can be rolled back independently.
- All primary actions and state distinctions must remain understandable without colour.

## Information hierarchy

1. Protocol event: open, close, liquidation, take profit, stop loss, timeout or expiration.
2. Position state: market, side, margin, leverage, notional and P&L.
3. Lifecycle: opening transaction, current position version and terminal transaction/state.
4. UTXO proof: inputs, position-bearing input/output, protocol instruction and settlement outputs.
5. Bitcoin detail: native explorer sections revealed below the protocol interpretation.

## Semantic colour system

The base remains ink, paper and neutral rules. Accents are quiet, accessible and reserved for meaning:

| Meaning | Token | Visual backup |
| --- | --- | --- |
| Long / positive | `--pump-long`, `--pump-positive` | arrow up-right, solid line |
| Short / negative | `--pump-short`, `--pump-negative` | arrow down-left, dashed line |
| Open / funding input | `--pump-open`, `--pump-input` | open node, left branch |
| Position-bearing UTXO | `--pump-position` | heavier branch and inset rule |
| Close | `--pump-closed` | lifecycle terminal node |
| Liquidation / warning | `--pump-liquidation` | stop icon and double rule |
| Output / pending settlement | `--pump-output`, `--pump-pending` | right branch and square marker |

Colour is never paired with a redundant text label and icon in the same compact control. Tooltips and accessible names provide the hidden explanation.

## Transaction lineage interaction

- The lifecycle rail always runs from the opening transaction to a close transaction or indexed terminal state.
- The current transaction is marked with an inset event-colour rule.
- Each Bitcoin input links to its parent transaction.
- A consumed position input is detected by matching its outpoint against the public position identifier.
- An opening position output is detected from the sanitized `open_vout` field.
- Each spent output links to its spending transaction; unspent outputs remain informative, non-destructive nodes.
- OP_RETURN is described as a Pumpologia protocol instruction without showing its raw payload.
- Hover changes emphasis only. Navigation requires click, keyboard activation or an explicit link.
- Desktop uses a branching graph. Mobile changes to a logical input → event → output reading order without horizontal scrolling.
- Large transactions show a bounded branch set and an explicit remainder count; the native explorer remains available for the full proof.

## Public data contract

Position detail may expose only the minimum lineage required for navigation:

- opening transaction id and output index;
- closing transaction id and consumed input index when an on-chain close exists;
- sanitized position versions containing ids, heights, state and consuming transaction id;
- existing trading metrics already used by the terminal.

The list and activity endpoints stay bounded and paginated. They do not inherit the detailed lineage array. Raw payloads, scripts, indexer implementation fields and unrestricted upstream responses remain private.

## Component rules

- Use one spacing rhythm based on 4, 8, 12, 16, 24 and 32 pixels.
- Body copy must never be smaller than 13px; interactive labels target at least 14px.
- Interactive targets are at least 36px, or 44px on touch-first layouts.
- Cards use alignment and rules, not shadows or decorative gradients, to communicate grouping.
- Loading keeps the final layout dimensions stable with skeletons.
- Empty states state what is absent and whether the indexer is still current.
- Errors do not reveal upstream URLs or error bodies.
- Tables and tapes paginate server-side. Graphs cap initial nodes and progressively reveal overflow.

## Delivery sequence

1. Inventory routes, contracts, typography, colour and inherited component constraints.
2. Establish semantic tokens and accessible primitives.
3. Ship the position lifecycle and UTXO transaction lineage as an additive transaction-page layer.
4. Bring blocks, activity, position detail and charts onto the same visual primitives.
5. Normalize responsive navigation, search and large-data loading.
6. Run production builds, API contract checks and desktop/mobile visual qualification.
7. Back up the running image, deploy an immutable image tag, verify health and critical journeys, and retain an explicit rollback tag.

## Acceptance journeys

- Opening transaction: identify long/short, position output, protocol instruction and live P&L.
- Explicit close: navigate from close to opening transaction and back from the opening page to close.
- Automatic terminal event: explain the indexed settlement without inventing a transaction link.
- UTXO navigation: open any funding parent and any known spending child.
- Block event: open the full position or transaction without loading the block's complete Bitcoin transaction list.
- Mobile: open the menu, search, inspect a block event, traverse a position lifecycle and read all metrics without horizontal overflow.
- Failure: API or outspend failure preserves the decoded event and never blocks the native explorer.

## Production and rollback

Each release records the source commit, immutable frontend and backend image tags, image digests, backup location, deploy time and smoke-test result. Before replacing containers, tag the currently running images with a dated rollback name. Rollback restores both images together unless the release changes only one independently compatible surface.
