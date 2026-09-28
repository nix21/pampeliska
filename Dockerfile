# ---------- Frontend ----------
FROM node:22-alpine AS web
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npx tsc -b && npx vite build --outDir /out/wwwroot --emptyOutDir

# ---------- Backend ----------
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY Pampeliska.slnx ./
COPY src/Pampeliska.Core/Pampeliska.Core.csproj src/Pampeliska.Core/
COPY src/Pampeliska.Api/Pampeliska.Api.csproj src/Pampeliska.Api/
RUN dotnet restore src/Pampeliska.Api/Pampeliska.Api.csproj
COPY src/ src/
RUN dotnet publish src/Pampeliska.Api/Pampeliska.Api.csproj -c Release -o /app --no-restore

# ---------- Runtime ----------
FROM mcr.microsoft.com/dotnet/aspnet:10.0
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /data/keys && chown -R app:app /data
WORKDIR /app
COPY --from=build /app ./
COPY --from=web /out/wwwroot ./wwwroot
ENV ASPNETCORE_URLS=http://+:8080 \
    ASPNETCORE_ENVIRONMENT=Production \
    Storage__Root=/data
VOLUME /data
EXPOSE 8080
USER app
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD curl -fs http://localhost:8080/healthz || exit 1
ENTRYPOINT ["dotnet", "Pampeliska.Api.dll"]
