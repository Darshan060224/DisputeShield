# Contributing to DisputeShield

Thank you for your interest in contributing to DisputeShield!

---

## 🛠️ Local Setup & Quality Workflow

### 1. Prerequisites
- Node.js `v20+` or `v22+`
- Package Manager: `pnpm` (v10+ recommended)
- MySQL / TiDB instance or Docker Compose

### 2. Quickstart

```bash
# Clone & install dependencies
git clone git@github.com:Darshan060224/DisputeShield.git
cd DisputeShield
pnpm install

# Copy environment template
cp .env.example .env

# Start development server (Frontend + Backend)
pnpm dev
```

### 3. Quality & Verification Checks

Before submitting a pull request, ensure all verification commands pass cleanly:

```bash
# TypeScript strict check (0 errors required)
pnpm check

# Vitest test suite execution (49 test files / 133+ tests)
pnpm test

# Prettier code formatting
pnpm format
```

---

## 🔒 Code Standards & Rules

- **Strict Typing**: No implicit `any` types. Ensure all tRPC procedures have typed inputs and returns.
- **Defense-Only Logic**: Never implement automatic money movement or external dispute submission.
- **Secrets Protection**: Do NOT commit plaintext `.env` values or production API credentials.
