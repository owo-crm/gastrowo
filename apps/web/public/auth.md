# Platofy auth.md

How AI agents can (and cannot) get access to Platofy.

## Audience

AI agents and assistants acting for a restaurant owner, manager or team member, and developers building such agents.

## Agent registration

Platofy does not offer self-service registration, API keys or OAuth clients for agents yet. Agents must not create Platofy accounts on their own: an account belongs to a real business and its owner.

There is no OAuth Protected Resource or Authorization Server metadata to discover at this time.

## Supported methods

| Method | Who | How |
|---|---|---|
| Anonymous | Any agent | Read the public site (`/llms.txt`, Markdown pages) and call the public endpoints in the [OpenAPI document](https://platofy.app/openapi.json): `GET https://api.platofy.app/health`, `POST https://api.platofy.app/marketing/leads`. No credentials. |
| Human sign-in | A person | The person signs in at https://platofy.app/login with their email (one-time code or password). The session belongs to that person's browser and is not meant to be handed to an agent. |

## Using credentials

There are no agent credentials to use. Do not ask people for their one-time codes or passwords.

## Want agent access?

If you are building an integration (for example with a POS or payroll system), write to support@platofy.app.
