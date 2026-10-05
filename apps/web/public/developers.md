# Platofy for developers and AI agents

Platofy is staff scheduling software for restaurants, cafés and bars. This page lists what machines can use.

## Public API

Base URL: `https://api.platofy.app`

| Method | Path | What it does |
|---|---|---|
| GET | `/health` | 200 when the API and its database are up |
| POST | `/marketing/leads` | Sends a restaurant's contact details to the Platofy team (e.g. a free switch-over request). Rate limited. |

Machine-readable description: [OpenAPI](https://platofy.app/openapi.json). API catalog: [/.well-known/api-catalog](https://platofy.app/.well-known/api-catalog).

Only call `POST /marketing/leads` on behalf of a person who asked you to contact Platofy.

## Everything else

The scheduling app (schedules, people, hours, payroll) is private to each restaurant and needs a signed-in user. There are no API keys or OAuth clients for third parties yet; see [auth.md](https://platofy.app/auth.md).

## Reading the site

- Product summary for AI assistants: [llms.txt](https://platofy.app/llms.txt), full text in [llms-full.txt](https://platofy.app/llms-full.txt)
- Every public page has a Markdown version (`<page>.md`, or send `Accept: text/markdown`)
- Live demo restaurant for people: https://platofy.app/demo

Questions: support@platofy.app
