# airtable-backup

This is a script that can back up an Airtable database to static files.
records becomes CSVs, and attachments are downloaded as files.

Put your Airtable information in environment variables, for example in `.env.local`:

```
API_KEY="my-api-key-here"
BASE_ID="airtable-base-id-here"
```

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```
