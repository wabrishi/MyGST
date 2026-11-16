# Example external plugin: Event log

A small, dependency-free Node server that shows the whole external-plugin protocol. It is not part of the MyGST build.

```bash
node examples/external-plugin/server.mjs        # http://localhost:4100
```

Then, signed in to MyGST as a super admin:

1. Go to **Admin → Plugins → Add an external plugin** and enter `http://localhost:4100/manifest.json`. Plain `http://localhost` is accepted only outside production.
2. Click **Install**, then choose whether it's on by default and which companies can use it.
3. Open a company and issue an invoice. The event shows up under **Apps → Event log** and in the dashboard widget.
4. Put the word `BLOCK` in an invoice's notes. The plugin's `document.validate` hook stops the save.

The server stores what MyGST sends it (API key, secret, events) in `data.json` next to the script. Delete that file to start over.
