# Simplified single-platform build for cloud builders (Railway/Render build on amd64).
# Avoids multi-arch BUILDPLATFORM/TARGETARCH args that can stall or misbehave
# when the builder does not populate them.

# build stage
FROM mcr.microsoft.com/dotnet/sdk:7.0 AS build
WORKDIR /source

# Restore first (cached layer as long as the csproj doesn't change)
COPY *.csproj .
RUN dotnet restore

# Then build/publish
COPY . .
RUN dotnet publish -c Release -o /app --no-restore

# runtime stage
FROM mcr.microsoft.com/dotnet/runtime:7.0
WORKDIR /app
COPY --from=build /app .
ENTRYPOINT ["dotnet", "Worker.dll"]
