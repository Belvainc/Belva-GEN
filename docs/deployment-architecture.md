# Deployment Architecture — Belva-GEN

## Overview

Belva-GEN runs as a Next.js application backed by PostgreSQL, Redis, and optional OpenClaw. Agent execution happens via the Anthropic API (no GPU required). This document describes the target AWS deployment.

## Architecture Diagram

```
                    ┌─────────────────┐
                    │   CloudFront    │
                    │   (CDN/WAF)     │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │   ALB (HTTPS)   │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
     ┌────────▼──────┐ ┌────▼──────┐ ┌────▼──────┐
     │  ECS Task 1   │ │ ECS Task 2│ │ ECS Task N│
     │  Next.js App  │ │ Next.js   │ │ Next.js   │
     │  + Workers    │ │ + Workers │ │ + Workers │
     └───────┬───────┘ └─────┬─────┘ └─────┬─────┘
             │               │              │
     ┌───────▼───────────────▼──────────────▼──────┐
     │                  VPC                         │
     │  ┌──────────┐  ┌──────────┐  ┌───────────┐  │
     │  │ RDS      │  │ElastiCache│  │ Secrets   │  │
     │  │PostgreSQL│  │ Redis 7  │  │ Manager   │  │
     │  │ 16       │  │          │  │           │  │
     │  └──────────┘  └──────────┘  └───────────┘  │
     └─────────────────────────────────────────────┘
             │
     ┌───────▼──────────────────────────────────┐
     │  External APIs                            │
     │  - Anthropic (Claude API)                 │
     │  - Jira Cloud (REST API + Webhooks)       │
     │  - Slack (Incoming Webhooks)              │
     │  - GitHub (Octokit REST API)              │
     └──────────────────────────────────────────┘
```

## Compute — ECS Fargate

| Setting | Value | Rationale |
|---------|-------|-----------|
| Service | ECS Fargate | No EC2 management, auto-scaling |
| CPU | 1 vCPU per task | Next.js + BullMQ workers |
| Memory | 2 GB per task | Handles concurrent agent requests |
| Min tasks | 2 | High availability |
| Max tasks | 6 | Scales with agent load |
| Auto-scale trigger | CPU > 70% or queue depth > 10 | |

**Alternative:** EC2 (t3.medium) if Fargate costs exceed budget. Same Docker image, just different orchestration.

## Database — RDS PostgreSQL 16

| Setting | Value |
|---------|-------|
| Instance | db.t4g.medium |
| Storage | 50 GB gp3 |
| Multi-AZ | Yes (production) |
| Backup | 7-day retention, automated |
| Connection | Via VPC security group, port 5432 |

Prisma migrations run as a one-off ECS task during deployment.

## Cache — ElastiCache Redis 7

| Setting | Value |
|---------|-------|
| Node type | cache.t4g.micro |
| Cluster mode | Disabled (single node for MVP) |
| Use | BullMQ job queues, rate limiting, session cache |

## Secrets Management

All credentials stored in AWS Secrets Manager:

| Secret | Path |
|--------|------|
| Database URL | `/belva-gen/database-url` |
| Redis URL | `/belva-gen/redis-url` |
| Anthropic API key | `/belva-gen/anthropic-api-key` |
| Jira API token | `/belva-gen/jira-api-token` |
| Jira user email | `/belva-gen/jira-user-email` |
| Slack webhook URL | `/belva-gen/slack-webhook-url` |
| GitHub token | `/belva-gen/github-token` |
| Webhook secret | `/belva-gen/webhook-secret` |

ECS tasks read secrets at startup via IAM role + Secrets Manager integration.

## Networking

- **VPC** with public + private subnets across 2 AZs
- **ALB** in public subnet, terminates HTTPS
- **ECS tasks** in private subnet
- **RDS + ElastiCache** in private subnet, no public access
- **NAT Gateway** for outbound API calls (Anthropic, Jira, Slack, GitHub)
- **Security groups** restrict traffic to minimum required ports

## Monitoring — CloudWatch

| Metric | Alarm Threshold |
|--------|----------------|
| ECS CPU utilization | > 80% for 5 min |
| ECS memory utilization | > 85% for 5 min |
| RDS connections | > 80% of max |
| RDS free storage | < 5 GB |
| Redis memory usage | > 80% |
| ALB 5xx error rate | > 1% for 5 min |
| BullMQ queue depth | > 50 jobs waiting |

Application logs shipped to CloudWatch Logs via Pino JSON output.

## Deployment Pipeline

```
git push → GitHub Actions →
  1. Run tests (unit + E2E)
  2. Build Docker image
  3. Push to ECR
  4. Run Prisma migrations (one-off ECS task)
  5. Update ECS service (rolling deployment)
  6. Health check verification
```

- Zero-downtime deployments via ECS rolling update
- Rollback: ECS automatically rolls back if health checks fail
- Docker image tagged with git SHA for traceability

## Cost Estimate (Monthly)

| Service | Estimate |
|---------|----------|
| ECS Fargate (2 tasks) | ~$60 |
| RDS PostgreSQL (t4g.medium, Multi-AZ) | ~$130 |
| ElastiCache Redis (t4g.micro) | ~$15 |
| ALB | ~$20 |
| NAT Gateway | ~$35 |
| Secrets Manager (8 secrets) | ~$4 |
| CloudWatch | ~$10 |
| **Total** | **~$274/mo** |

Anthropic API costs are usage-based and separate (~$0.003/1K input tokens for Sonnet).

## Cross-References

- Infrastructure provisioning checklist: `plans/DEVOPS-NEEDS.md`
- Docker Compose (local dev): `docker-compose.yml`
- Environment variables: `src/server/config/env.ts`
- Agent executor configuration: `AGENT_EXECUTOR` env var
