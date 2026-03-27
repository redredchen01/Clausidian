# Changelog

All notable changes to the Session Wrap Backend will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.8.0] - 2026-03-27

### Added - Phase 8: Enterprise Features

#### Phase 8A - RBAC (Role-Based Access Control)
- New tables: `roles`, `user_roles`, `resource_permissions`, `workspaces`
- Authorization middleware: `checkRole()`, `checkResourcePermission()`
- RBAC API endpoints:
  - `GET/POST /api/workspaces` - Workspace management
  - `POST/PUT/DELETE /api/workspaces/:id/members` - Member management
  - `GET /api/me/permissions` - User permission query
  - `GET /api/permissions/check` - Permission verification
  - `GET /api/roles` - List available roles
- Default roles: admin, editor, viewer
- Support for multi-tenant workspaces

#### Phase 8B - Analytics Dashboard
- New tables: `analytics_snapshots`, `decision_analytics`, `agent_performance`
- Analytics API endpoints:
  - `GET /api/analytics/dashboard/:workspaceId` - Dashboard snapshot
  - `GET /api/analytics/trends/:workspaceId` - Trend analysis
  - `GET /api/analytics/agents/:workspaceId` - Agent performance metrics
  - `GET /api/analytics/decisions/:workspaceId` - Decision analytics
  - `GET /api/analytics/insights/:workspaceId` - AI-generated insights
- KPI calculation and trend trending
- Automated insight generation based on metrics
- Agent performance scoring and leaderboards

#### Phase 8C - External Integrations
- New tables: `integrations`, `integration_events`
- Integration framework supporting:
  - Slack Webhook integration (real-time notifications)
  - GitHub API integration (issue sync)
  - Jira API integration (story point sync)
- Integration management endpoints:
  - `GET/POST /api/integrations/:workspaceId` - Config management
  - `PUT /api/integrations/:integrationId/toggle` - Enable/disable
  - `DELETE /api/integrations/:integrationId` - Remove integration
  - `GET /api/integrations/:integrationId/events` - Event history
- Service-specific test endpoints for connection verification
- Integration event logging for auditing and debugging

#### Phase 8D - Performance Optimization
- Redis cache layer with in-memory fallback
- Cache module: `src/cache/redis.js`
- Configurable TTL for different data types:
  - Tasks: 5 minutes
  - Decisions: 10 minutes
  - Analytics: 1 hour
  - User permissions: 2 minutes
  - Workspace members: 5 minutes
- Cache key generation and pattern-based invalidation
- Graceful degradation when Redis is unavailable

### Database Schema Updates
- Added 8 new tables supporting enterprise features
- Added 14 new indexes for query optimization
- Backward compatible with existing schema

### Dependencies Added
- `ioredis` (optional, for Redis caching)
- All integrations use existing `axios` dependency

### API Changes
- All new endpoints under `/api/` namespace
- JWT authentication required for protected routes
- Supports workspace-scoped and global operations

## [3.7.0] - 2026-03-26

### Phase 7: Interactive Dashboard

#### Phase 7A - WebSocket Real-time Sync
- Replaced HTTP polling with WebSocket
- Bidirectional real-time updates
- Auto-reconnection with exponential backoff
- Fallback to polling on connection failure

#### Phase 7B - Task Editing CRUD
- Full create, read, update, delete operations from UI
- Form validation and error handling
- Real-time sync across clients

#### Phase 7C - Decision Search & Filtering
- Full-text search for decisions
- Multi-dimensional filtering (tags, status, priority)
- Search result ranking and pagination

#### Phase 7D - Team Collaboration
- Activity feed showing all changes
- Comments system for discussion
- @mention support for user notifications

---

## [3.6.0] - 2026-03-10

### Added
- Web dashboard MVP
- Basic task management
- Memory statistics display
- Agent sync status tracking

---

## [3.5.1] and earlier

Initial releases with basic session wrap storage and CLI integration
