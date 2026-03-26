const pool = require('../config/database');

const schema = `
-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_id VARCHAR(255) UNIQUE,
  github_login VARCHAR(255),
  email VARCHAR(255),
  avatar_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Claude Code subscriptions
CREATE TABLE IF NOT EXISTS claude_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  claude_token VARCHAR(1000) NOT NULL,
  subscription_status VARCHAR(50) DEFAULT 'active',
  verified_at TIMESTAMP,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Session wraps storage
CREATE TABLE IF NOT EXISTS session_wraps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_name VARCHAR(255),
  wrap_date TIMESTAMP,
  summary TEXT,
  memory_size BIGINT,
  obsidian_files_count INTEGER,
  metadata JSONB,
  s3_path VARCHAR(1000),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- API tokens for CLI auth
CREATE TABLE IF NOT EXISTS api_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(500) NOT NULL UNIQUE,
  name VARCHAR(255),
  last_used_at TIMESTAMP,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_wraps_user_id ON session_wraps(user_id);
CREATE INDEX IF NOT EXISTS idx_wraps_created_at ON session_wraps(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON claude_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_tokens_token ON api_tokens(token);
`;

async function initDB() {
  try {
    console.log('🔄 Creating schema...');
    await pool.query(schema);
    console.log('✅ Schema created/verified');
  } catch (error) {
    console.error('❌ Database init error:', error);
    throw error;
  }
}

module.exports = { initDB, pool };
