# Contributing to E-Agent / Ravenhill

## Getting Started

1. Clone the repo:
   ```bash
   git clone https://github.com/muhammadrashid4587/e-agent.git
   cd e-agent
   ```

2. Set up the backend:
   ```bash
   cd packages/api
   python -m venv .venv
   source .venv/bin/activate  # Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   cp .env.example .env       # Fill in your local config
   uvicorn main:app --reload
   ```

3. Set up the frontend:
   ```bash
   cd packages/web
   npm install
   cp .env.example .env.local  # Fill in your local config
   npm run dev
   ```

## Development Rules

### Before You Code
- Pick up a task from Notion (or create one if it doesn't exist)
- Create a feature branch from `main`: `git checkout -b feature/your-feature`
- If it's a bug fix: `git checkout -b fix/your-fix`

### While You Code
- **Python:** Run `ruff check` and `ruff format` before committing
- **TypeScript:** Run `npm run lint` and `npm run format` before committing
- Write tests for new functionality — especially agent logic and API endpoints
- Keep PRs small and focused. One feature or fix per PR.

### Before You Submit a PR
- [ ] All tests pass locally
- [ ] No linter errors
- [ ] No secrets or keys in the code
- [ ] PR description explains **what** and **why**
- [ ] Linked to the relevant Notion task

### Code Review
- Every PR needs at least 1 approval
- Reviewer should check for: correctness, security issues, test coverage, and simplicity
- Use "Request Changes" for blockers, "Comment" for suggestions

## Commit Message Format

```
<type>: <short description>

<optional body — explain why, not what>
```

Types: `feat`, `fix`, `docs`, `chore`, `test`, `refactor`

Examples:
```
feat: add Gmail OAuth flow for sending notifications
fix: handle timezone offset in Google Calendar sync
chore: pin anthropic SDK to 0.40.x
```

## Adding a New Integration

1. Create `packages/api/integrations/<service_name>/`
2. Implement the connector interface from `packages/shared/`
3. Add OAuth setup and document required scopes in `docs/integrations/<service_name>.md`
4. Write integration tests with recorded API fixtures
5. Add the service to the registry in `packages/api/registry/`

## Environment Variables

Never hardcode configuration. Use `.env` files locally and Fly.io secrets in production.

Required variables are documented in `.env.example` files in each package.

## Questions?

- Check `docs/` for architecture decisions
- Ask in the team Notion or directly in a GitHub issue
