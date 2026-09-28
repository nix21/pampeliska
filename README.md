# Pampeliška

Rodinné finance jedné domácnosti s více členy: účty, pohyby, kategorizace (pravidla + AI přes MCP), rozpočty,
pravidelné platby, výhled zůstatku a investice. Rozhraní česky, desktop i mobil, světlý i tmavý režim.

Stack je převzatý z Invoiceru: .NET 10 (minimal API, EF Core, PostgreSQL 17), React 19 + Vite (Radix UI, CSS Modules),
přihlášení Googlem, vlastní OAuth 2.1 server pro MCP, Docker Compose na VPS.

## Lokální vývoj

```bash
docker run -d --name pampeliska-pg -e POSTGRES_USER=pampeliska -e POSTGRES_PASSWORD=pampeliska -e POSTGRES_DB=pampeliska -p 55433:5432 postgres:17
dotnet run --project src/Pampeliska.Api --launch-profile http   # http://localhost:5290
cd web && npm install && npm run dev                              # http://localhost:5174
```

V Development je zapnutý `Auth:DevBypass` – přihlášení bez Googlu jako první e-mail z `Auth:OwnerEmails`.

## Testy

```bash
dotnet test tests/Pampeliska.Tests
cd web && npx tsc -b && npx oxlint
cd web && npx playwright test          # E2E proti běžícímu API (E2E_BASE_URL, výchozí http://localhost:5290)
```

## Dokumentace

- [docs/mcp.md](docs/mcp.md) – MCP server a OAuth
- [docs/vps-setup.md](docs/vps-setup.md) – nasazení na VPS vedle Invoiceru
