# careai-core-api
Medical Document Recognition

## Development

Install dependencies:

```sh
pnpm install
```

Apply database migrations (includes `processing_progress` on `documents`):

```sh
pnpm migration:up
```

Run the API in development mode:

```sh
pnpm run dev
```

Run API and document worker together (needed for `POST /documents/process`):

```sh
pnpm run dev:all
```

Build and run the compiled API:

```sh
pnpm run build
pnpm start
```

Run compiled API and worker together (after build; optional local convenience):

```sh
pnpm run start:all
```

Health check:

```sh
curl http://localhost:3000/health
```
