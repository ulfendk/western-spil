# Deployment: Portainer + nginx

The game ships as one Docker image, `ghcr.io/ulfendk/western-spil`, for `linux/amd64` and `linux/arm64`. It contains:

- the game server (Colyseus + Express),
- the PWA client,
- pre-rendered Danish narration,
- Piper TTS for dynamic lines.

It speaks **plain HTTP on port 2567**. TLS is handled by your nginx.

## Images

GitHub Actions (`.github/workflows/docker.yml`) builds and pushes:

| Trigger        | Tags                     |
| -------------- | ------------------------ |
| push to `main` | `latest`, `sha-<short>`  |
| tag `v1.2.3`   | `1.2.3`, `1.2`, `latest` |

GHCR packages are private by default. Either:

- make the package public (GitHub → your profile → Packages → western-spil → Package settings → Change visibility), **or**
- add a registry in Portainer (Registries → Add → Custom, URL `ghcr.io`, your GitHub username and a PAT with `read:packages`).

## Portainer stack

1. **Stacks → Add stack → Web editor**, and paste `deploy/portainer-stack.yml`.
2. Deploy.
3. Optional auto-redeploy: in the stack, enable **Webhook** and copy its URL. Store it as the repository secret `PORTAINER_WEBHOOK_URL`, and every push to `main` then redeploys.

   Alternatively, enable "Re-pull image" in the stack's GitOps settings.

## nginx

WebSockets need the upgrade headers. Idle town connections need a long read timeout.

```nginx
server {
    listen 443 ssl http2;
    server_name western.example.dk;
    # ssl_certificate ... (as usual)

    location / {
        proxy_pass http://127.0.0.1:2567;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}

# In the http {} block (once):
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}
```

Notes:

- Serve the game at the **root of a (sub)domain**. The service worker is scoped to `/`.
- The PWA install and the service worker require HTTPS, which nginx provides. Plain `http://localhost` also works for testing.
- The client derives every URL from the page's own origin, so there's no host configuration.
- The server trusts `X-Forwarded-*` headers, which the per-IP rate limit on rejsekode lookups relies on.
- Don't let nginx cache `/sw.js`, `/index.html` or `/version.json`. The server already sends `Cache-Control: no-cache` for them.

## Updates

A new image is picked up by the PWA automatically:

- The service worker checks for updates on launch, when the app regains focus, and every 30 minutes.
- An update is applied at the next safe point (the title screen or the pause menu), so a kid is never interrupted mid-game.
- If the server's protocol version changed, older clients are told to update immediately when they join a town.

## Data, backups and restore

Everything persistent lives in the `/data` volume:

| Path                                  | Contents                                                                           |
| ------------------------------------- | ---------------------------------------------------------------------------------- |
| `/data/western.db`                    | Saves (SQLite), keyed by each player's 6-word _rejsekode_                          |
| `/data/backups/western-YYYY-MM-DD.db` | Automatic daily online backup (at startup, then every 24h); the newest 14 are kept |
| `/data/tts/`                          | Cache of dynamically rendered narration (safe to delete)                           |

Player-side safety nets:

- Progress is also kept in the browser.
- The **Sikkerhedskopi** screen shows the player's _rejsekode_ ("write it down!"). It also lets them download or upload a backup file, or continue on another device with the code.

**Back up the volume** with your usual tooling. A simple option is copying the daily backup files off the host:

```sh
docker run --rm -v western-data:/data -v "$PWD":/out alpine \
  sh -c 'cp /data/backups/*.db /out/'
```

**Restore the server database:**

1. Stop the stack.
2. Copy a backup over the live database, and remove the WAL files:

   ```sh
   docker run --rm -v western-data:/data -v "$PWD":/in alpine sh -c \
     'cp /in/western-2026-09-28.db /data/western.db && rm -f /data/western.db-wal /data/western.db-shm && chown 1000:1000 /data/western.db'
   ```

3. Start the stack again.
