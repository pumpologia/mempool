# Pumpologia Mempool deployment

This fork adds a production-oriented deployment for a self-hosted Mempool explorer while keeping upstream `mempool/mempool` available as the `upstream` Git remote.

## Architecture

- `pumpologia-mempool-web`: official Mempool frontend, reachable locally on `127.0.0.1:8082` and from the existing `pumpologia_default` Docker network on port `8080`.
- `pumpologia-mempool-api`: backend built from this fork on host port `8999` so it can use the existing loopback-only Bitcoin Core RPC and Electrs services. The Pumpologia patch consumes Bitcoin Core `getblock` verbosity-3 prevouts and retrieves confirmed transactions through Electrs while Core's transaction index catches up.
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

docker compose \
  -f docker-compose.pumpologia.yml \
  --env-file .env.pumpologia \
  config --quiet

docker compose \
  -f docker-compose.pumpologia.yml \
  --env-file .env.pumpologia \
  up -d

docker compose \
  -f docker-compose.pumpologia.yml \
  --env-file .env.pumpologia \
  ps

curl --fail http://127.0.0.1:8999/api/v1/backend-info
curl --fail http://127.0.0.1:8082/api/blocks/tip/height
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

Re-run the compose pull/up commands after reviewing upstream release notes. Production should eventually replace `latest` with tested image digests.

## Cloudflare exposure: recommended hostname

Recommended public URL: `https://mempool.pumpologia.app`.

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
2. Add a public hostname / published application:
   - hostname: `mempool.pumpologia.app`
   - service type: `HTTP`
   - origin URL: `http://pumpologia-mempool-web:8080`
   - no Cloudflare Access policy if the explorer should be public.
3. In the `pumpologia.app` DNS zone, create or verify:
   - type: `CNAME`
   - name: `mempool`
   - target: `9a6f7864-5019-41fa-977d-6ab650ee0085.cfargotunnel.com`
   - proxy status: **Proxied**
   - TTL: **Auto**
4. If adding the published application automatically created the CNAME, do not create a duplicate.

Cloudflare requires the DNS zone and tunnel to belong to the same Cloudflare account. If `pumpologia.app` is in another account, create a tunnel in that account instead of pointing at this tunnel.

The `pumpologia.app` zone and `pumpologia-production` tunnel are in the same Cloudflare account. The production route is live with:

- DNS record ID: `3863d829e7778769774a6dc0b698361c`
- tunnel configuration version: `17`
- origin: `http://pumpologia-mempool-web:8080`

The route was added through the Cloudflare API. Before the next Terraform apply against the existing tunnel module, represent this public hostname in infrastructure-as-code; that module owns and rewrites the complete ingress list.

No public A/AAAA record to the VPS, no port opening, and no Certbot certificate are required. Cloudflare terminates public TLS and sends HTTP through the encrypted tunnel. This is especially important for the `.app` TLD, whose browsers require HTTPS.

### Verification

```sh
dig +short CNAME mempool.pumpologia.app
curl -I https://mempool.pumpologia.app/
curl --fail https://mempool.pumpologia.app/api/v1/blocks/tip/height
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

1. Remove or disable only the `mempool.pumpologia.app` tunnel route.
2. Remove its CNAME.
3. Run the stack-specific `docker compose ... down` command.
4. Keep `/var/lib/pumpologia/mempool` until a separate retention decision.

The existing Pumpologia frontend, admin, logs, Bitcoin Core, Electrs and Cloudflare routes remain untouched.
