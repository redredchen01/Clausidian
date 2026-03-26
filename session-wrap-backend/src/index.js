require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { initDB } = require('./db/init');
const authRoutes = require('./routes/auth');
const wrapRoutes = require('./routes/wraps');
const userRoutes = require('./routes/users');
const { errorHandler } = require('./middleware/errorHandler');
const { autoAuthenticateAgent } = require('./middleware/agent-auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',').map(s => s.trim());
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('combined'));

// Auto-detect and authenticate any agent
app.use(autoAuthenticateAgent);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/wraps', wrapRoutes);
app.use('/api/users', userRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling
app.use(errorHandler);

// Initialize DB and start server
async function start() {
  try {
    console.log('🔧 Initializing database...');
    await initDB();
    console.log('✅ Database initialized');

    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`📊 API: http://localhost:${PORT}/api`);
      console.log(`❤️  Health: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

start();

module.exports = app;
