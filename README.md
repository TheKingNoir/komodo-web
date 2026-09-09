# 🦎 Komodo Host — Web Structure

This repository contains the complete authentication backend and frontend for the Komodo Hosting platform.
It handles user registration (local + Google OAuth), session management, and serves the public-facing dashboard and authentication pages.

---

## 📦 What's inside

- **Backend** (`/backend`) — Node.js + Express + SQLite
- **Frontend** (`/auth`, `/dashboard`) — HTML, CSS, vanilla JS
- **Google OAuth** — fully integrated
- **Session management** — token-based with expiration
- **PM2-ready** — for production deployment

---

## 🚀 Deployment Guide (for developers)

When you make changes to the code and push them to this repository, use the following commands on the **production server** to apply the updates:

    # 1. Navigate to the project root
    cd /var/www/Komodo-Web

    # 2. Pull the latest changes from GitHub
    git pull origin main

    # 3. Install or update dependencies (inside the backend folder)
    npm install

    # 4. Restart the PM2 process
    pm2 restart komodo

---

## 🔒 Credentials

When prompted for credentials:

    Username: ToxiPain
    Password: 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
