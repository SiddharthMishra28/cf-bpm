# BPM Rule Engine API on Cloudflare Workflows 🌩️
### A lightweight, scalable, serverless BPM automation engine with a nested rule evaluation system — 100% on Cloudflare Free Tier.

[![License: GPLv3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![Cloudflare Workers](https://img.shields.io/badge/Built%20for-Cloudflare%20Workers-orange.svg)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)]()

### 🚨 Problem
Traditional Business Process Management (BPM) systems are expensive, infrastructure-heavy, and often tightly coupled with enterprise stacks.
Testing, scaling, and maintaining complex rules for workflows quickly becomes painful — especially for small teams or open systems.

### 💡 Solution
This project brings **serverless BPM automation and dynamic rule validation** to the edge — powered by **Cloudflare Workflows**, **Workers**, **D1**, and **KV**.
It provides a fully programmable API to define, evaluate, and orchestrate multi-step business processes with nested logical rules.

### 🧠 Architecture Overview

```
┌────────────────────┐
│  Client / Integrator│
└─────────┬───────────┘
          │
          ▼
┌─────────────────────────────┐
│ Cloudflare Worker API Layer │
│  - Auth & Routing            │
│  - BPM REST Endpoints        │
└─────────┬───────────────────┘
          │
          ▼
┌─────────────────────────────┐
│ Cloudflare Workflow Engine  │
│  - Orchestration             │
│  - Rule Evaluation           │
│  - Inflight Workflow Mgmt    │
└─────────┬───────────────────┘
          │
          ▼
┌──────────────┬───────────────┐
│ D1 Database  │ KV Storage     │
│ - Rule Sets  │ - Caching Eval │
│ - Workflow   │ - Temp States  │
└──────────────┴───────────────┘
```

### 📂 Folder Structure

```
├── .cloudflare/
│   └── workflows/ # Cloudflare Workflow scripts
├── migrations/ # SQL migration files for D1
├── src/ # Source code
│   ├── auth.ts # API key authentication middleware
│   ├── cache.ts # KV caching helpers
│   ├── db.ts # D1 database utilities
│   ├── evaluatorService.ts # Rule evaluation service with caching
│   ├── executionService.ts # Durable execution service
│   ├── hmac.ts # HMAC signing utility
│   ├── rateLimiter.ts # D1-based rate limiter
│   ├── ruleEngine.ts # Core rule evaluation logic
│   ├── rulesController.ts # Business logic for rule management
│   ├── securityUtils.ts # Hashing and key verification utilities
│   ├── worker.ts # Main Cloudflare Worker entrypoint
│   └── workflowExecutor.ts # Workflow execution logic
├── tests/ # Unit and integration tests
├── wrangler.toml # Cloudflare project configuration
├── package.json # Dependencies and scripts
├── LICENSE # GPLv3 license
└── README.md # Project documentation
```

### ⚙️ Features
✅ Fully serverless BPM orchestration on Cloudflare Workflows
✅ Nested and grouped rule evaluation (AND, OR, NOT, XOR)
✅ D1-backed persistence for rules and workflows
✅ KV caching for fast rule evaluation
✅ Role-based API key authentication (Admin, Developer, Read-only)
✅ Versioned rule sets — inflight workflows are isolated from updates
✅ REST API for defining, executing, and monitoring workflows
✅ No paid dependencies — runs entirely on Cloudflare free tier

### 📖 API Documentation

This project includes comprehensive interactive API documentation using Swagger UI.
Once your worker is running (locally with `npm run dev` or deployed), you can access the documentation at the root URL:

- **Local development**: `http://127.0.0.1:8787/`
- **Production**: `https://<your-worker>.workers.dev/`

The Swagger UI provides:
- Complete endpoint documentation with parameters and response schemas
- Interactive "Try it out" feature to test API calls directly from your browser
- Authentication headers for API key usage
- Example request/response payloads

**Alternative formats:**
- OpenAPI JSON spec: `https://<your-worker>.workers.dev/openapi.json`
- ReDoc format: `https://<your-worker>.workers.dev/redoc`

### 🚀 Setup & Installation

#### 1️⃣ Prerequisites
- Node.js 18+
- Cloudflare Account (Free)
- Wrangler CLI installed:
  ```bash
  npm install -g wrangler
  ```

#### 2️⃣ Clone and install
```bash
git clone https://github.com/<your-org>/cloudflare-bpm-rule-engine.git
cd cloudflare-bpm-rule-engine
npm install
```

#### 3️⃣ Run the interactive setup wizard
```bash
npm run setup
```

The setup wizard will:
- Check prerequisites (Wrangler CLI, Node.js)
- Guide you through Cloudflare authentication
- Create KV namespaces for caching
- Create D1 database for persistence
- Update `wrangler.toml` with resource IDs
- Run all database migrations
- Optionally deploy the application

#### 4️⃣ Deploy (if not done during setup)
```bash
wrangler deploy
```

You’ll get a public API URL once deployed.

### 🧩 Example: Loan Application Approval Workflow

#### Rule Set: "Loan Eligibility Rules"
```json
{
  "name": "loan-eligibility",
  "rule_json": {
    "type": "group",
    "operator": "AND",
    "children": [
      {
        "type": "condition",
        "field": "credit_score",
        "operator": ">=",
        "value": 700
      },
      {
        "type": "condition",
        "field": "income",
        "operator": ">=",
        "value": 40000
      }
    ]
  }
}
```

#### Workflow Definition:
```json
{
  "name": "loan_approval_v1",
  "steps_json": [
    { "id": "step_1", "type": "RULE_EVAL", "ruleSetName": "loan-eligibility", "ruleSetVersion": 1, "onSuccess": "step_2", "onFail": "reject_step" },
    { "id": "step_2", "type": "CALL_API", "url": "https://api.example.com/notify", "method": "POST", "bodyTemplate": { "status": "approved" }, "onSuccess": "final_step" },
    { "id": "reject_step", "type": "END" },
    { "id": "final_step", "type": "END" }
  ]
}
```

#### Execute via API:
```bash
curl -X POST https://<your-worker>.workers.dev/api/workflow/start \
  -H "Authorization: ApiKey id=<your-api-key-id>,key=<your-api-key>" \
  -d '{"workflowName": "loan_approval_v1", "input": {"credit_score": 750, "income": 60000}}'
```

### 🔄 Inflight Workflow Versioning

When a workflow or ruleset is updated:
- The system **freezes** the old version for inflight executions.
- Only **new executions** pick up the updated definition.
- This guarantees deterministic behavior for existing runs.

### 👥 Contributing

We ❤️ open collaboration!

1. Fork this repo
2. Create a new branch (`feature/my-improvement`)
3. Commit your changes
4. Push to your branch
5. Open a Pull Request with a short summary

Please ensure commits follow conventional commits and that your code passes lint & tests.

### ⚖️ License

This project is licensed under the **GNU General Public License v3.0 (GPLv3)**.

You are free to:
- Use, modify, and distribute the code
- Fork and build upon it for open or commercial purposes

As long as:
- Your derivative works remain **open-source under the same license**

See [LICENSE](./LICENSE) for details.
