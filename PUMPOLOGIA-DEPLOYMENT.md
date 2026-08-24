# Pumpologia Mempool deployment

This fork adds a production-oriented deployment for a self-hosted Mempool explorer while keeping upstream `mempool/mempool` available as the `upstream` Git remote.

## Architecture

- `pumpologia-mempool-web`: Pumpologia-branded Angular frontend built from this fork, reachable locally on `127.0.0.1:8082` and from the existing `pumpologia_default` Docker network on port `8080`.
- `pumpologia-mempool-api`: backend built from this fork on host port `8999` so it can use the existing loopback-only Bitcoin Core RPC, Electrs and the Pumpologia indexer. Its `/api/pumpologia/v1/*` gateway is read-only and returns purpose-built trading DTOs; health, sync, account, oracle, scripts, raw payloads and internal indexer records are not public routes.
- `pumpologia-mempool-db`: isolated MariaDB on `127.0.0.1:3307`.
- Bitcoin Core: existing mainnet node at `127.0.0.1:8332`, authenticated through the read-only mounted cookie.
- Electrs: existing mainnet server at `127.0.0.1:50001`, without TLS because traffic stays on the host.
- Persistent state: `/var/lib/pumpologia/mempool/{mysql,cache}`.
- Secrets: `.env.pumpologia`, root-only and ignored by Git.

No Bitcoin, Electrs, Pumpologia application, x420.ai, PostgreSQL, Redis, or existing Cloudflare container is replaced by this stack.

## Bitcoin transaction index

Mempool's complete historical transaction search requires Bitcoin Core `txindex=1`. It is enabled in `/etc/bitcoin/bitcoin.conf`. Modern Bitcoin Core builds this index in the background without rebuilding the chainstate or downloading the blockchain again; `getindexinfo` reports progress. During that initial catch-up, current blocks and recent transactions work, while older transaction/address lookups can remain incomplete or slow.

Configuration rollback backup:

```text
/etc/bitcoin/bitcoin.conf.before-mempool-txindex-20260824
```

Check progress with:

```sh
bitcoin-cli -conf=/etc/bitcoin/bitcoin.conf -datadir=/var/lib/bitcoin getindexinfo txindex
```

## Lifecycle

```sh
cd /root/pumpologia/mempool
make -f Makefile.pumpologia check
make -f Makefile.pumpologia up

docker compose \
  -f docker-compose.pumpologia.yml \
  --env-file .env.pumpologia \
  ps

curl --fail http://127.0.0.1:8999/api/v1/backend-info
curl --fail http://127.0.0.1:8082/api/blocks/tip/height
curl --fail http://127.0.0.1:8082/api/pumpologia/v1/summary
test "$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8082/api/pumpologia/v1/health)" = 404
curl --fail http://127.0.0.1:8082/
```

The frontend reaches the host-network backend through Docker's host gateway. Keep the narrow firewall rule present:

```sh
ufw allow from 172.16.0.0/12 to any port 8999 proto tcp comment 'Pumpologia Mempool frontend to backend'
```

Port `8999` remains blocked from the public Internet by UFW's default-deny policy.

Stop only this stack:

```sh
docker compose -f docker-compose.pumpologia.yml --env-file .env.pumpologia down
```

`down` does not delete `/var/lib/pumpologia/mempool`. Do not add `--volumes` to cleanup commands without a backup decision.

## Updating the fork

```sh
cd /root/pumpologia/mempool
git fetch upstream
git checkout master
git merge --ff-only upstream/master
git push origin master
```

`Makefile.pumpologia` sets `MEMPOOL_GIT_COMMIT`, `MEMPOOL_BACKEND_IMAGE_TAG`
and `MEMPOOL_FRONTEND_IMAGE_TAG` from the committed revision. Never publish an
image whose embedded revision describes an uncommitted worktree.

## Cloudflare exposure and canonical hostname

Canonical public URL: `https://pumpologia.app`.

- `https://www.pumpologia.app/*` returns `308` to the same path and query on the apex.
- `https://mempool.pumpologia.app/*` returns `308` to the same path and query on the apex.
- Requests to `/api/*` on the legacy mempool hostname return `410`, preventing a
  non-idempotent request from being replayed against the canonical origin.

The existing Pumpologia tunnel ID is:

```text
9a6f7864-5019-41fa-977d-6ab650ee0085
```

The origin reachable from the existing `pumpologia-cloudflared-1` container is:

```text
http://pumpologia-mempool-web:8080
```

Both the tunnel route and DNS record are required.

### Cloudflare dashboard

1. Open **Zero Trust → Networks → Tunnels → `pumpologia-production`**.
2. Add three public hostnames / published applications:
   - hostnames: `pumpologia.app`, `www.pumpologia.app`, `mempool.pumpologia.app`
   - service type: `HTTP`
   - origin URL: `http://pumpologia-mempool-web:8080`
   - no Cloudflare Access policy if the explorer should be public.
3. In the `pumpologia.app` DNS zone, create or verify each hostname:
   - type: `CNAME`
   - names: `@`, `www`, `mempool`
   - target: `9a6f7864-5019-41fa-977d-6ab650ee0085.cfargotunnel.com`
   - proxy status: **Proxied**
   - TTL: **Auto**
4. If adding the published application automatically created the CNAME, do not create a duplicate.

Cloudflare requires the DNS zone and tunnel to belong to the same Cloudflare account. If `pumpologia.app` is in another account, create a tunnel in that account instead of pointing at this tunnel.

The `pumpologia.app` zone and `pumpologia-production` tunnel are in the same Cloudflare account. The production route is live with:

- DNS record ID: `3863d829e7778769774a6dc0b698361c`
- tunnel configuration version: `17`
- origin: `http://pumpologia-mempool-web:8080`

The production Terraform module supports these as `public_tunnel_routes`; it
owns both DNS and the complete tunnel ingress list. Existing live records must
be imported before the first apply.

No public A/AAAA record to the VPS, no port opening, and no Certbot certificate are required. Cloudflare terminates public TLS and sends HTTP through the encrypted tunnel. This is especially important for the `.app` TLD, whose browsers require HTTPS.

### Verification

```sh
dig +short CNAME pumpologia.app
curl --fail https://pumpologia.app/
curl --fail https://pumpologia.app/api/v1/blocks/tip/height
curl --fail https://pumpologia.app/api/pumpologia/v1/summary
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' https://www.pumpologia.app/protocol
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' https://mempool.pumpologia.app/tx/0000000000000000000000000000000000000000000000000000000000000000
```

Expected CNAME target:

```text
9a6f7864-5019-41fa-977d-6ab650ee0085.cfargotunnel.com.
```

The API tip should match the local Bitcoin node within normal synchronization delay.

## Cloudflare production notes

- Keep WebSockets enabled; the Mempool UI uses live data.
- Do not cache `/api/*` responses at the edge.
- A conservative cache rule may cache versioned static assets only.
- Add a rate-limit/WAF rule to `/api/*` before advertising the explorer heavily.
- Do not expose ports `8999`, `3307`, `8332`, or `50001` publicly.
- Keep the Cloudflare tunnel ingress declaration in infrastructure-as-code once the route is accepted. The existing Terraform configuration owns the complete ingress list, so a manual route omitted from Terraform can disappear on a later apply.

## Rollback

The root-only pre-cutover bundle under `/var/backups/pumpologia-explorer/`
contains the previous container/image metadata, resolved Compose file, live
configuration and Cloudflare DNS/tunnel/settings JSON with checksums.

1. Restore the backed-up tunnel configuration and DNS/settings JSON through the
   Cloudflare API.
2. Retag the previous frontend/backend image IDs recorded in the bundle.
3. Recreate only `api` and `web` with the previous image tags; keep MariaDB and
   `/var/lib/pumpologia/mempool` untouched.
4. Verify the legacy hostname, Bitcoin tip and backend health before announcing rollback.

The existing Pumpologia frontend, admin, logs, Bitcoin Core, Electrs and Cloudflare routes remain untouched.
