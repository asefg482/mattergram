# Mattergram — Telegram Web Client for Mattermost

A modern, high-performance web client for **Mattermost** built with **Vue 3**, **TypeScript**, **Pinia**, and **Tailwind CSS**. Its user interface and user experience (UI/UX) are designed to closely mirror **Telegram Web**.

---

## 🌟 Features

- 🎨 **Authentic Telegram Web Experience**:
  - Chat bubbles with Telegram-style speech tails (`outgoing` and `incoming`).
  - Telegram chat wallpaper doodle pattern background.
  - Message timestamps, delivery, and read receipts (`✓` sent, `✓✓` read).
  - Sticky/centered date separators dividing chat history.
  - Interactive hover actions toolbar for quick emoji reactions and message management (Reply, Edit, Delete, Copy).
  - Quote reply preview bar and inline editing bar.
  - Full bidirectional text and RTL support (`dir="auto"`).
  - Dark Mode and Light Mode with manual and automatic system theme toggles.
  - Telegram sound effects for incoming and outgoing messages powered by the Web Audio API.

- 🔗 **Configurable Server Connection**:
  - Dynamically configured via `MATTERMOST_BASE_URL` in `.env` or container runtime environment.
  - Server latency and health test indicator ("Test Connection").
  - Seamless CORS bypassing through an internal intelligent reverse proxy (Vite dev proxy and Node.js production proxy).

- ⚡️ **Real-Time WebSocket Synchronization**:
  - Instant live message delivery (`posted`).
  - Real-time typing status in chat headers and conversation lists (`user is typing...`).
  - User presence updates: online, away, dnd, offline (`status_change`).
  - Live emoji reactions (`reaction_added`, `reaction_removed`).
  - Immediate message edits and deletions (`post_edited`, `post_deleted`).

- 📁 **Rich Media & File Attachments**:
  - Direct file, document, and media uploads to Mattermost.
  - Image lightbox preview with smooth zoom, pan, and navigation.
  - Document cards with file type detection, size formatting, and one-click download.

- 👥 **Comprehensive Channel & Messaging Support**:
  - Public Channels, Private Groups, and Direct Messages.
  - **Saved Messages** folder with dedicated bookmark styling.
  - Telegram-style category tabs: *All Chats*, *Channels*, *Direct Messages*, *Unread*.
  - Left navigation drawer menu and right-hand collapsible Chat Info drawer.

---

## ⚙️ Environment Configuration (.env)

Before running the application, create a `.env` file from `.env.example` and set your Mattermost server URL:

```bash
cp .env.example .env
```

Contents of `.env`:
```env
MATTERMOST_BASE_URL=https://your-mattermost-server.com
```

---

## 🚀 Getting Started

### 1. Development Mode
```bash
npm install
npm run dev
```
The application will be available at `http://localhost:5173`.

### 2. Production Build
```bash
npm run build
npm start
```
Starts the production HTTP & WebSocket proxy server serving the compiled frontend bundle.

---

## 🐳 Docker & Docker Compose

### Option 1: Run directly from GitHub Packages (Recommended)
Pre-built container images are automatically published on every push to `master`:

```bash
docker run -d \
  --name mattergram \
  -p 5173:5173 \
  -e MATTERMOST_BASE_URL=https://your-mattermost-server.com \
  ghcr.io/asefg482/mattergram:latest
```

### Option 2: Build and run locally with Docker
```bash
docker build -t mattergram .

docker run -d \
  --name mattergram \
  -p 5173:5173 \
  -e MATTERMOST_BASE_URL=https://your-mattermost-server.com \
  mattergram
```

### Option 3: Run with Docker Compose
Configure your `.env` file, then run:

```bash
docker compose up -d
```
The service will be live at `http://localhost:5173`.

---

## 📦 Continuous Integration & GitHub Packages

An automated GitHub Actions workflow is configured at [`.github/workflows/build.yml`](.github/workflows/build.yml). On every push to `master` or when releasing a new tag:

1. **Dependency Verification**: Installs packages with clean caching (`npm ci`).
2. **Type Checking & Bundling**: Compiles TypeScript and creates production Vite assets (`npm run build`).
3. **Artifact Packaging**: Archives build assets (`mattergram-release.tar.gz`) as downloadable release artifacts.
4. **Container Packaging**: Builds a multi-stage Docker image and publishes it to **GitHub Container Registry (GHCR)** at `ghcr.io/asefg482/mattergram:latest`.

---

## 🛠 Tech Stack

- **Frontend Framework**: Vue 3 (Composition API, `<script setup>`)
- **Language**: TypeScript
- **State Management**: Pinia
- **Styling**: Tailwind CSS & Lucide Icons
- **HTTP & WebSocket Proxy**: Node.js, `http-proxy`, `ws`
- **Containerization**: Docker (Alpine multi-stage), Docker Compose
