# Production Setup Guide

Deploy session-wrap-backend to production and enable cloud sync for your agent workflows.

## Option 1: Railway (Recommended - 5 minutes)

### Prerequisites
- Railway account: https://railway.app (free tier available)
- GitHub account with session-wrap-skill repo

### Step 1: Create Railway Project

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Create new project
railway init
# Select: Empty project
# Name: session-wrap-backend
```

### Step 2: Add PostgreSQL

```bash
# In your Railway project
railway add
# Select: PostgreSQL
# This creates DATABASE_URL automatically
```

### Step 3: Configure Environment Variables

```bash
railway variables set \
  NODE_ENV=production \
  JWT_SECRET=$(openssl rand -base64 32) \
  CLAUDE_CODE_API_URL=https://api.claude.ai \
  PORT=3000
```

### Step 4: Deploy Backend

```bash
# From session-wrap-backend directory
cd session-wrap-backend

# Connect to Railway
railway link

# Deploy
railway up

# Get public URL
railway variables get | grep RAILWAY_PUBLIC_DOMAIN
# Output: https://session-wrap-skill-prod.railway.app
```

### Step 5: Update Agents' Configuration

```bash
# Set on each agent/machine
export SESSION_WRAP_API_URL="https://session-wrap-skill-prod.railway.app"

# Add to ~/.zshrc for persistence
echo 'export SESSION_WRAP_API_URL="https://your-url.railway.app"' >> ~/.zshrc
```

### Step 6: Test Cloud Sync

```bash
# Test cloud endpoint
curl https://session-wrap-skill-prod.railway.app/health

# Output: {"status":"healthy","timestamp":"..."}
```

---

## Option 2: Docker Compose (Local Testing)

For local development before production:

```bash
cd session-wrap-backend

# Start backend + PostgreSQL + Redis
docker-compose up

# Backend runs at http://localhost:3000
export SESSION_WRAP_API_URL=http://localhost:3000
```

---

## Option 3: Manual VPS Deployment

For complete control (DigitalOcean, AWS, GCP, etc.):

### Prerequisites
- VPS with Node.js 18+
- PostgreSQL 13+
- Redis (optional, for caching)

### Steps

```bash
# SSH to server
ssh user@your-server

# Clone repo
git clone https://github.com/redredchen01/session-wrap-skill.git
cd session-wrap-skill/session-wrap-backend

# Install dependencies
npm install --production

# Setup .env
cat > .env << EOF
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://user:pass@localhost/session_wrap
JWT_SECRET=$(openssl rand -base64 32)
CLAUDE_CODE_API_URL=https://api.claude.ai
EOF

# Run database migrations
npm run db:init

# Start server
pm2 start src/index.js --name "session-wrap-api"

# Configure reverse proxy (nginx)
# Point your domain to localhost:3000
```

### Nginx Config Example

```nginx
server {
    listen 80;
    server_name api.session-wrap.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## Cloud Sync Workflow

Once backend is deployed:

### Agent Flow

```bash
# 1. Login (first time)
wrap login
# → Prompts for agent token (CLAUDE_CODE_TOKEN, CURSOR_TOKEN, etc.)
# → Gets JWT from backend
# → Saves token to ~/.session-wrap/token

# 2. Normal session wrap (auto-syncs to cloud)
wrap "Completed feature X"
# → Creates local session_YYYYMMDD_wrap.md
# → Auto-uploads to backend via SESSION_WRAP_API_URL

# 3. Check status
wrap status
# → Verifies JWT is valid
# → Shows cloud sync status

# 4. View history
wrap history
# → Lists your recent wraps from cloud

# 5. Logout
wrap logout
# → Removes token, disables cloud sync
```

### Multi-Agent Cloud Sharing

```bash
# Agent A: Upload progress
agent-share write agent-a ~/final-state.md

# Agent B: Download progress (if on same network/cloud)
# Requires: shared backend instance
agent-share read agent-a

# See cloud task status
agent-tasks status
# → Shows tasks assigned to other agents
```

---

## Monitoring & Maintenance

### Health Check

```bash
# Check API status
curl $SESSION_WRAP_API_URL/health

# Expected: {"status":"healthy","timestamp":"2026-03-26T..."}
```

### View Logs (Railway)

```bash
railway logs
# Streams real-time logs
```

### Database Backup (PostgreSQL)

```bash
# Backup
pg_dump $DATABASE_URL > backup.sql

# Restore
psql $DATABASE_URL < backup.sql
```

### Monitor Storage

```bash
# Check wraps storage usage
curl -H "Authorization: Bearer $JWT_TOKEN" \
  $SESSION_WRAP_API_URL/api/users/profile
```

---

## Security Considerations

✅ **DO:**
- Use strong JWT_SECRET (min 32 bytes)
- Enable HTTPS (Railway does this automatically)
- Rotate JWT_SECRET every 6 months
- Keep Node.js and PostgreSQL updated
- Use environment variables for secrets (never in git)

❌ **DON'T:**
- Expose JWT_SECRET in logs
- Store session tokens in config files
- Disable HTTPS in production
- Share DATABASE_URL between environments
- Run latest code without testing

---

## Troubleshooting

### "Cannot connect to Claude API"
→ Check CLAUDE_CODE_API_URL is correct
→ Verify network allows outbound HTTPS

### "Database connection failed"
→ Check DATABASE_URL format
→ Verify PostgreSQL is running
→ Check firewall rules

### "JWT verification failed"
→ JWT_SECRET mismatch between server and client
→ Token expired (default 7 days)
→ Run `wrap login` again to refresh

### "Cloud sync not working"
→ Check SESSION_WRAP_API_URL environment variable
→ Verify backend is running: `curl $SESSION_WRAP_API_URL/health`
→ Check token: `wrap status`

---

## Performance Tuning

### For 100+ concurrent agents:

```bash
# Increase database connections
DATABASE_POOL_SIZE=20

# Enable Redis caching
REDIS_URL=redis://localhost:6379

# Increase memory
NODE_OPTIONS="--max-old-space-size=2048"
```

### For large memory files (>100MB):

```bash
# Implement compression
ENABLE_GZIP_COMPRESSION=true

# Archive old data
agent-optimize archive  # Monthly
```

---

## Production Checklist

- [ ] Backend deployed to production
- [ ] PostgreSQL database running
- [ ] HTTPS enabled
- [ ] JWT_SECRET configured (32+ bytes)
- [ ] Health check passing
- [ ] Agent can login (`wrap login`)
- [ ] Session auto-syncs to cloud
- [ ] Multi-agent can share memory
- [ ] Backups configured
- [ ] Monitoring/alerts setup
- [ ] Documentation updated with API URL

---

## Next Steps

1. Choose deployment option (Railway recommended)
2. Deploy backend
3. Update `SESSION_WRAP_API_URL` on all machines
4. Test cloud sync: `wrap login` → `wrap` → `wrap history`
5. Enable agent-share for multi-agent workflows

**Production setup takes 5-15 minutes. Your agents now have global cloud-backed memory!** 🚀
