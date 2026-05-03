# 🗳️ Distributed Voting App

A **multi-container distributed voting application** built and maintained by **[@shreyastk](https://github.com/shreyastk)** as a hands-on DevOps project. This app demonstrates real-world containerization, microservices architecture, and CI/CD automation using Docker and GitHub Actions.

---

## 🧱 Architecture

```
 Browser ──► [Vote App - Python/Flask] ──► [Redis] ──► [Worker - .NET]
                                                              │
 Browser ──► [Result App - Node.js] ◄── [PostgreSQL] ◄───────┘
```

| Service    | Tech            | Role                                      |
|------------|-----------------|-------------------------------------------|
| `vote`     | Python / Flask  | Frontend to cast votes (Cats vs Dogs 🐱🐶) |
| `redis`    | Redis           | Message queue for incoming votes           |
| `worker`   | .NET 7          | Consumes votes from Redis → stores in DB  |
| `db`       | PostgreSQL 15   | Persistent vote storage                   |
| `result`   | Node.js         | Real-time result dashboard                |
| `seed`     | Python          | Optional: seeds random votes for testing  |

> **Architecture diagram** → `architecture.excalidraw.png`

---

## 🚀 Quick Start

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop) (includes Docker Compose)
- Git

### Run locally with Docker Compose

```bash
git clone https://github.com/shreyastk/example-voting-app.git
cd example-voting-app
docker compose up --build
```

| App     | URL                                       |
|---------|-------------------------------------------|
| Vote    | [http://localhost:8080](http://localhost:8080) |
| Results | [http://localhost:8081](http://localhost:8081) |

### Seed random votes (optional)

```bash
docker compose --profile seed up -d
```

### Stop and clean up

```bash
docker compose down -v
```

---

## 🛠️ Development Mode

Each service supports hot-reload during development:

- **vote** – uses `watchdog` to auto-reload Flask on file changes (volume-mounted)
- **result** – uses `nodemon` for live reload
- **worker** – rebuild required on changes

```bash
docker compose up --build vote result
```

---

## 🐳 Docker Images

Pre-built images are published to GitHub Container Registry (`ghcr.io`) and Docker Hub on every push to `main`:

| Image                             | Registry       |
|-----------------------------------|----------------|
| `ghcr.io/shreyastk/voting-app-vote`   | GitHub Packages |
| `ghcr.io/shreyastk/voting-app-result` | GitHub Packages |
| `ghcr.io/shreyastk/voting-app-worker` | GitHub Packages |

Run with pre-built images (no build required):

```bash
docker compose -f docker-compose.images.yml up
```

---

## ☸️ Kubernetes Deployment

YAML manifests are in the `k8s-specifications/` directory.

```bash
# Deploy
kubectl apply -f k8s-specifications/

# Access
# Vote app   → NodePort 31000
# Result app → NodePort 31001

# Teardown
kubectl delete -f k8s-specifications/
```

---

## 🔄 CI/CD

This repo uses **GitHub Actions** for automated Docker builds and pushes:

| Workflow         | Trigger                    | Description                  |
|------------------|----------------------------|------------------------------|
| `build-vote`     | Push/PR to `vote/**`       | Builds & pushes Vote image   |
| `build-result`   | Push/PR to `result/**`     | Builds & pushes Result image |
| `build-worker`   | Push/PR to `worker/**`     | Builds & pushes Worker image |

Images are pushed to **GHCR** on merges to `main`.

---

## 📝 Notes

- One vote per browser session (cookie-based deduplication)
- This is a **DevOps learning project** — not production-hardened
- PostgreSQL data is persisted via a named Docker volume (`db-data`)

---

## 👤 Author

**Shreyas TK**  
[![GitHub](https://img.shields.io/badge/GitHub-shreyastk-181717?style=flat&logo=github)](https://github.com/shreyastk)  
[![Email](https://img.shields.io/badge/Email-shreyastk173%40gmail.com-D14836?style=flat&logo=gmail)](mailto:shreyastk173@gmail.com)

---

## 📄 License

This project is licensed under the **Apache 2.0 License** — see [LICENSE](LICENSE) for details.
