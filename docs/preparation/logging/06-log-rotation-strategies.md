# Log Rotation Strategies and Implementation

## Overview

Log rotation is the process of archiving old log files and starting new ones to prevent unbounded disk space consumption. This document covers rotation strategies, tools, and best practices for Node.js applications.

## Why Log Rotation?

Without rotation, log files will:
- **Consume all available disk space** over time
- **Degrade performance** as file size increases
- **Make debugging difficult** (searching through GB-sized files)
- **Violate compliance requirements** (retention policies)

## Rotation Triggers

### 1. Time-Based Rotation

Rotate logs on a fixed schedule (hourly, daily, weekly, monthly):

**Pros**:
- Predictable log file names (e.g., `app-2025-01-15.log`)
- Easy to implement retention policies (keep last 30 days)
- Consistent file sizes for analysis

**Cons**:
- Files may grow very large between rotations if traffic is high
- May rotate empty files during low-traffic periods

**Use Cases**:
- Applications with predictable traffic patterns
- Compliance requirements (daily log archival)

### 2. Size-Based Rotation

Rotate logs when file reaches a threshold (10MB, 50MB, 100MB):

**Pros**:
- Prevents runaway file growth
- Consistent file sizes for processing
- Adapts to traffic volume

**Cons**:
- Unpredictable file names without timestamps
- Hard to implement time-based retention

**Use Cases**:
- High-traffic applications
- Variable traffic patterns
- Preventing disk space exhaustion

### 3. Hybrid Rotation (Recommended)

Combine time and size triggers - rotate when **either** condition is met:

**Example**: Rotate daily OR when file reaches 50MB, whichever comes first.

**Pros**:
- Prevents both time-based and size-based issues
- Most flexible and robust approach
- Adapts to traffic patterns

**Cons**:
- Slightly more complex configuration

**Use Cases**:
- Production applications (recommended for most cases)

## Implementation Options

### Option 1: pino-roll (Recommended for Pino)

`pino-roll` is a Pino transport for automatic file rotation.

#### Installation

```bash
pnpm add pino-roll
```

#### Basic Configuration

```typescript
import pino from 'pino';

const logger = pino({
  transport: {
    target: 'pino-roll',
    options: {
      file: './logs/app.log',
      frequency: 'daily',    // Rotate daily
      mkdir: true            // Create logs/ directory if missing
    }
  }
});
```

#### Hybrid Rotation (Daily + Size)

```typescript
const logger = pino({
  transport: {
    target: 'pino-roll',
    options: {
      file: './logs/app.log',
      frequency: '1d',       // Rotate every 1 day
      size: '50m',           // OR when file reaches 50MB
      mkdir: true
    }
  }
});
```

#### Retention Policy

```typescript
const logger = pino({
  transport: {
    target: 'pino-roll',
    options: {
      file: './logs/app.log',
      frequency: 'daily',
      size: '50m',
      mkdir: true,
      limit: {
        count: 14            // Keep last 14 files (14 days)
      }
    }
  }
});
```

#### Symlink to Current Log

```typescript
const logger = pino({
  transport: {
    target: 'pino-roll',
    options: {
      file: './logs/app.log',
      frequency: 'daily',
      symlink: true          // Create current.log symlink
    }
  }
});
```

This creates `logs/current.log` → `logs/app-2025-01-15.log`, updated on each rotation.

#### Frequency Options

| Value | Description |
|-------|-------------|
| `'daily'` or `'1d'` | Rotate daily at midnight |
| `'hourly'` or `'1h'` | Rotate hourly |
| `'1w'` | Rotate weekly |
| `'1M'` | Rotate monthly |

#### Size Options

| Value | Description |
|-------|-------------|
| `'10k'` | 10 kilobytes |
| `'10m'` | 10 megabytes |
| `'10g'` | 10 gigabytes |
| `10485760` | Size in bytes |

#### Full Configuration Example

```typescript
import pino from 'pino';
import path from 'path';

function createLogger() {
  return pino({
    level: process.env.LOG_LEVEL || 'info',
    transport: {
      targets: [
        // Rotated file logs (production)
        {
          target: 'pino-roll',
          level: 'info',
          options: {
            file: path.join(process.cwd(), 'logs/app.log'),
            frequency: 'daily',
            size: '50m',
            mkdir: true,
            symlink: true,
            limit: {
              count: 14
            }
          }
        },
        // Console output (always)
        {
          target: process.env.NODE_ENV === 'development' ? 'pino-pretty' : 'pino/file',
          level: 'debug',
          options: process.env.NODE_ENV === 'development' ? {
            colorize: true,
            translateTime: 'yyyy-mm-dd HH:MM:ss',
            ignore: 'pid,hostname'
          } : {
            destination: 1  // stdout
          }
        }
      ]
    }
  });
}
```

#### Known Issues

From GitHub issues:

> "During rotation, rotating-file-stream attempts to rename the current app.log file and create a new one. However, if pino is writing to app.log at that moment — especially when the file is large — the rename operation sometimes fails, resulting in an ENOENT error."

**Mitigation**: Use moderate rotation sizes (50MB recommended) to minimize write conflicts during rotation.

### Option 2: System logrotate (Zero Node.js Overhead)

`logrotate` is a Linux utility for managing log rotation at the system level.

#### Benefits

- **Zero application overhead** - rotation happens outside Node.js
- **Battle-tested** - used by most Linux systems
- **Flexible** - supports compression, deletion, emailing, custom scripts
- **Centralized** - one configuration for all applications

#### Configuration

Create `/etc/logrotate.d/chef`:

```
/var/log/chef/app.log {
    daily                    # Rotate daily
    rotate 14                # Keep 14 rotations
    compress                 # Compress old logs with gzip
    delaycompress           # Don't compress the most recent rotation
    missingok               # Don't error if log file is missing
    notifempty              # Don't rotate empty files
    create 0644 node node   # Create new file with these permissions
    sharedscripts
    postrotate
        # Send SIGUSR1 to Node.js process to reopen log file
        kill -USR1 $(cat /var/run/chef.pid) > /dev/null 2>&1 || true
    endscript
}
```

#### Size-Based Rotation

```
/var/log/chef/app.log {
    size 50M                 # Rotate when file reaches 50MB
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 0644 node node
}
```

#### Hybrid Configuration

```
/var/log/chef/app.log {
    daily                    # Rotate daily
    size 50M                 # OR when reaching 50MB
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 0644 node node
}
```

#### Testing logrotate

```bash
# Test configuration (dry run)
logrotate -d /etc/logrotate.d/chef

# Force rotation (for testing)
logrotate -f /etc/logrotate.d/chef
```

#### Application Setup

Your Node.js app must write to a fixed file path:

```typescript
const logger = pino({
  transport: {
    target: 'pino/file',
    options: {
      destination: '/var/log/chef/app.log'
    }
  }
});
```

**Important**: Let logrotate handle rotation. Don't use pino-roll with logrotate.

### Option 3: winston-daily-rotate-file (for Winston)

If using Winston instead of Pino, `winston-daily-rotate-file` provides built-in rotation.

#### Installation

```bash
pnpm add winston-daily-rotate-file
```

#### Configuration

```typescript
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

const transport = new DailyRotateFile({
  filename: 'application-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '14d'
});

const logger = winston.createLogger({
  transports: [transport]
});
```

#### Options

| Option | Description |
|--------|-------------|
| `filename` | Log filename (use %DATE% for timestamp) |
| `datePattern` | Moment.js date format (e.g., 'YYYY-MM-DD-HH') |
| `maxSize` | Max file size before rotation |
| `maxFiles` | Max files to keep (number or '14d') |
| `zippedArchive` | Compress rotated files |

#### Events

**Critical**: Always handle the `error` event to prevent crashes.

```typescript
transport.on('error', (err) => {
  console.error('Log rotation error:', err);
});

transport.on('rotate', (oldFilename, newFilename) => {
  console.log('Log rotated:', oldFilename, '->', newFilename);
});
```

## Retention Policies

### Time-Based Retention

Keep logs for a fixed duration:

```typescript
// pino-roll: Keep 14 files
{
  limit: {
    count: 14
  }
}

// winston-daily-rotate-file: Keep 14 days
{
  maxFiles: '14d'
}

// logrotate: Keep 14 rotations
rotate 14
```

### Count-Based Retention

Keep a fixed number of rotated files:

```typescript
// pino-roll
{
  limit: {
    count: 10
  }
}

// winston-daily-rotate-file
{
  maxFiles: 10
}

// logrotate
rotate 10
```

### Space-Based Retention

Limit total log directory size:

```bash
# logrotate with size limit
/var/log/chef/*.log {
    size 50M
    rotate 10  # Max 500MB total (10 files × 50MB)
}
```

### Compliance Considerations

Different industries have different retention requirements:

| Industry | Typical Retention | Notes |
|----------|-------------------|-------|
| Healthcare (HIPAA) | 6 years | Audit logs |
| Finance (SOX) | 7 years | Financial transactions |
| PCI-DSS | 1 year | Payment card data |
| GDPR | 30 days to 5 years | Depends on purpose |
| General | 30-90 days | Operational logs |

**Recommendation**: Consult compliance requirements before setting retention.

## Compression

Compress rotated logs to save disk space:

### pino-roll

pino-roll doesn't support built-in compression. Use logrotate with compression instead:

```
/var/log/chef/app.log {
    daily
    compress              # Compress with gzip
    delaycompress        # Don't compress most recent rotation
}
```

### winston-daily-rotate-file

```typescript
new DailyRotateFile({
  filename: 'app-%DATE%.log',
  zippedArchive: true    // Compress with gzip
});
```

### Compression Ratio

Expect **80-90% compression** for JSON logs:

```
app-2025-01-15.log      50MB
app-2025-01-15.log.gz   5-10MB
```

## Best Practices

### 1. Separate Logs by Level

```typescript
const logger = pino({
  transport: {
    targets: [
      // All logs
      {
        target: 'pino-roll',
        level: 'info',
        options: {
          file: './logs/app.log',
          frequency: 'daily',
          size: '50m'
        }
      },
      // Error logs only
      {
        target: 'pino-roll',
        level: 'error',
        options: {
          file: './logs/error.log',
          frequency: 'daily',
          size: '10m'
        }
      }
    ]
  }
});
```

### 2. Monitor Disk Space

Set up alerts for:
- **Disk usage > 80%**: Warning
- **Disk usage > 90%**: Critical
- **Log rotation failures**: Critical

```bash
# Cron job to check disk space
0 * * * * df -h /var/log | awk 'NR==2 {if(+$5>90) print "CRITICAL: "$5}' | mail -s "Log disk space alert" admin@example.com
```

### 3. Test Rotation

```typescript
// Generate logs to trigger rotation
for (let i = 0; i < 100000; i++) {
  logger.info({ iteration: i }, 'Test log entry');
}

// Check that rotation occurred
// ls -lh logs/
```

### 4. Archive Old Logs

Move old rotated logs to cheaper storage:

```bash
# Archive logs older than 30 days to S3
find /var/log/chef -name "*.log.gz" -mtime +30 -exec aws s3 cp {} s3://bucket/logs/ \; -delete
```

### 5. Handle Rotation Failures

```typescript
// pino-roll doesn't expose rotation errors directly
// Use process-level error handlers

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  // Don't exit - rotation failures shouldn't crash app
});
```

For winston-daily-rotate-file:

```typescript
transport.on('error', (err) => {
  console.error('Rotation error:', err);
  // Alert operations team
  sendAlert('Log rotation failed', err);
});
```

## Configuration Examples

### Development Environment

```typescript
const logger = pino({
  level: 'debug',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true }
  }
});
// No rotation needed - logs to console only
```

### Production Environment

```typescript
const logger = pino({
  level: 'info',
  transport: {
    targets: [
      // Rotated file logs
      {
        target: 'pino-roll',
        level: 'info',
        options: {
          file: './logs/app.log',
          frequency: 'daily',
          size: '50m',
          mkdir: true,
          symlink: true,
          limit: { count: 14 }
        }
      },
      // Console (for container logs)
      {
        target: 'pino/file',
        level: 'info',
        options: { destination: 1 }  // stdout
      }
    ]
  }
});
```

### Containerized Environment (Docker/K8s)

```typescript
// Don't rotate in container - let orchestration handle it
const logger = pino({
  level: 'info',
  transport: {
    target: 'pino/file',
    options: { destination: 1 }  // stdout only
  }
});
```

**Why?**
- Container orchestration systems (Docker, Kubernetes) handle log collection
- Logs to stdout/stderr are captured by container runtime
- Log rotation handled by Docker daemon or Kubernetes

## Decision Framework

| Scenario | Recommended Strategy |
|----------|---------------------|
| **Development** | Console only (no rotation) |
| **Production (VM/bare metal)** | pino-roll or logrotate |
| **Containerized (Docker)** | stdout only (no rotation) |
| **Kubernetes** | stdout only (no rotation) |
| **Serverless (Lambda)** | CloudWatch Logs (automatic) |
| **High-traffic app** | Hybrid rotation (daily + 50MB) |
| **Low-traffic app** | Daily rotation only |
| **Compliance-heavy** | Separate error logs, longer retention |

## Sources

- [pino-roll npm Package](https://www.npmjs.com/package/pino-roll)
- [winston-daily-rotate-file GitHub](https://github.com/winstonjs/winston-daily-rotate-file)
- [winston-daily-rotate-file npm](https://www.npmjs.com/package/winston-daily-rotate-file)
- [Pino with Logrotate Utility](https://techinsights.manisuec.com/nodejs/pino-with-logrotate-utility/)
- [Node.js Log Rotation Guide](https://www.w3tutorials.net/blog/nodejs-log-rotation/)
- [Production Winston Logging - Last9](https://last9.io/blog/winston-logging-in-nodejs/)
- [Complete Guide to Winston - Better Stack](https://betterstack.com/community/guides/logging/how-to-install-setup-and-use-winston-and-morgan-to-log-node-js-applications/)
