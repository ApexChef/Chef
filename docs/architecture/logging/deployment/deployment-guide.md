# Deployment and Configuration Guide

## Overview

This document specifies deployment strategies, configuration management, and operational considerations for the Chef Logging System.

## Environment Configurations

### Development Environment

**Purpose**: Local development with human-readable logs

**Configuration**:

```bash
# .env.development
NODE_ENV=development
LOG_LEVEL=debug
LOG_TO_FILE=false
```

**Behavior**:
- Log level: `debug` (verbose)
- Output: Terminal via pino-pretty (colorized)
- File logging: Disabled
- Format: Human-readable

**Example Output**:

```
[2025-12-22 10:30:45] DEBUG (cli-1703251200000/detectEvent): Detecting event type
    input: "Meeting notes about new feature..."
[2025-12-22 10:30:46] INFO (cli-1703251200000/detectEvent): Event type detected
    eventType: "planning"
```

### Production Environment

**Purpose**: Production deployment with structured JSON logs

**Configuration**:

```bash
# .env.production
NODE_ENV=production
LOG_LEVEL=info
LOG_TO_FILE=true
LOG_FILE_PATH=/var/log/chef/chef.log
LOG_ROTATION=true
LOG_ROTATION_FREQ=daily
LOG_ROTATION_SIZE=50m
LOG_RETENTION_DAYS=14
```

**Behavior**:
- Log level: `info` (standard operations)
- Output: stdout (JSON) + file (JSON, rotated)
- File logging: Enabled with rotation
- Format: Newline-delimited JSON (ndjson)

**Example Output**:

```json
{"level":30,"time":1703251200000,"threadId":"cli-1703251200000","step":"detectEvent","msg":"Detecting event type","input":"Meeting notes..."}
{"level":30,"time":1703251201000,"threadId":"cli-1703251200000","step":"detectEvent","msg":"Event type detected","eventType":"planning"}
```

### Testing Environment

**Purpose**: Automated tests with silent logging

**Configuration**:

```bash
# .env.test
NODE_ENV=test
LOG_LEVEL=silent
```

**Behavior**:
- Log level: `silent` (no output)
- Output: None
- File logging: Disabled
- Format: N/A

**Test Setup**:

```typescript
import { beforeEach, afterEach } from 'vitest';
import { resetLogger, createLogger } from '@chef/core/logger';

beforeEach(() => {
  resetLogger();
  createLogger({ level: 'silent', enabled: false });
});

afterEach(() => {
  resetLogger();
});
```

## Deployment Scenarios

### 1. CLI Application Deployment

#### Local Installation

```bash
# Install CLI globally
pnpm install -g @chef/cli

# Create log directory
mkdir -p ~/.chef/logs

# Configure via environment
export LOG_LEVEL=info
export LOG_FILE_PATH=~/.chef/logs/chef.log
export LOG_TO_FILE=true

# Run CLI
chef backlog process notes.md
```

#### Docker Container

```dockerfile
# Dockerfile for Chef CLI
FROM node:20-alpine

WORKDIR /app

# Copy application
COPY . .

# Install dependencies
RUN pnpm install --prod

# Create log directory
RUN mkdir -p /var/log/chef

# Environment variables
ENV NODE_ENV=production
ENV LOG_LEVEL=info
ENV LOG_TO_FILE=true
ENV LOG_FILE_PATH=/var/log/chef/chef.log

# Run CLI
ENTRYPOINT ["node", "dist/index.js"]
CMD ["backlog", "process"]
```

**Docker Compose**:

```yaml
# docker-compose.yml
version: '3.8'

services:
  chef-cli:
    build: .
    environment:
      NODE_ENV: production
      LOG_LEVEL: info
      LOG_TO_FILE: "true"
      LOG_FILE_PATH: /var/log/chef/chef.log
    volumes:
      - ./data:/data  # Input files
      - chef-logs:/var/log/chef  # Persist logs
    command: ["backlog", "process", "/data/notes.md"]

volumes:
  chef-logs:
```

#### Kubernetes Pod

```yaml
# kubernetes/chef-cli-pod.yaml
apiVersion: v1
kind: Pod
metadata:
  name: chef-cli
spec:
  containers:
    - name: chef
      image: chef-cli:latest
      env:
        - name: NODE_ENV
          value: "production"
        - name: LOG_LEVEL
          value: "info"
        - name: LOG_TO_FILE
          value: "true"
        - name: LOG_FILE_PATH
          value: "/var/log/chef/chef.log"
      volumeMounts:
        - name: logs
          mountPath: /var/log/chef
  volumes:
    - name: logs
      persistentVolumeClaim:
        claimName: chef-logs-pvc
```

### 2. Web Application Deployment

#### Docker Container

```dockerfile
# Dockerfile for Chef Web
FROM node:20-alpine

WORKDIR /app

COPY . .
RUN pnpm install --prod

# Create log directory
RUN mkdir -p /var/log/chef

# Expose port
EXPOSE 3000

# Environment variables (overridable)
ENV NODE_ENV=production
ENV LOG_LEVEL=info
ENV LOG_WEB_LEVEL=info
ENV LOG_TO_FILE=true
ENV LOG_FILE_PATH=/var/log/chef/web.log
ENV PORT=3000

# Start server
CMD ["node", "dist/server.js"]
```

**Docker Compose**:

```yaml
# docker-compose.yml
version: '3.8'

services:
  chef-web:
    build:
      context: .
      dockerfile: Dockerfile.web
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      LOG_LEVEL: info
      LOG_WEB_LEVEL: info
      LOG_TO_FILE: "true"
      LOG_FILE_PATH: /var/log/chef/web.log
    volumes:
      - chef-web-logs:/var/log/chef
    restart: unless-stopped

volumes:
  chef-web-logs:
```

#### Kubernetes Deployment

```yaml
# kubernetes/chef-web-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: chef-web
spec:
  replicas: 3
  selector:
    matchLabels:
      app: chef-web
  template:
    metadata:
      labels:
        app: chef-web
    spec:
      containers:
        - name: chef-web
          image: chef-web:latest
          ports:
            - containerPort: 3000
          env:
            - name: NODE_ENV
              value: "production"
            - name: LOG_LEVEL
              value: "info"
            - name: LOG_WEB_LEVEL
              value: "info"
            - name: LOG_TO_FILE
              value: "true"
            - name: LOG_FILE_PATH
              value: "/var/log/chef/web.log"
          volumeMounts:
            - name: logs
              mountPath: /var/log/chef
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 5
      volumes:
        - name: logs
          emptyDir: {}  # Or PVC for persistent logs

---
apiVersion: v1
kind: Service
metadata:
  name: chef-web-service
spec:
  selector:
    app: chef-web
  ports:
    - port: 80
      targetPort: 3000
  type: LoadBalancer
```

## Log Management

### File Rotation Strategy

**Configuration**:

```bash
LOG_ROTATION=true
LOG_ROTATION_FREQ=daily
LOG_ROTATION_SIZE=50m
LOG_RETENTION_DAYS=14
```

**Behavior**:
- **Frequency**: Daily rotation at midnight (or when size limit reached)
- **Size Trigger**: Rotate when file reaches 50MB
- **Retention**: Keep last 14 days of logs
- **Naming**: `chef.log`, `chef.log.1`, `chef.log.2`, etc.

**Implementation**: pino-roll

```typescript
// Automatically configured when LOG_TO_FILE=true
const transports = {
  targets: [
    {
      target: 'pino-roll',
      level: 'info',
      options: {
        file: '/var/log/chef/chef.log',
        frequency: 'daily',
        size: '50m',
        mkdir: true,
        symlink: true,  // Latest log symlinked to chef.log
        limit: { count: 14 }  // Keep 14 files
      }
    }
  ]
};
```

### System-Level logrotate (Alternative)

**Configuration**: `/etc/logrotate.d/chef`

```
/var/log/chef/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 0640 chef chef
    sharedscripts
    postrotate
        # No need to reload (Pino handles file rotation)
    endscript
}
```

**Benefits**:
- Zero Node.js overhead
- System-level management
- Compression support

**Tradeoffs**:
- Requires system configuration
- Not portable (needs admin access)

### Log Aggregation (Future)

**Architecture**:

```
Chef Application
    ↓ (stdout JSON)
Container Runtime (Docker/K8s)
    ↓
Log Shipper (Fluent Bit, Logstash)
    ↓
Log Aggregation (Elasticsearch, CloudWatch, Datadog)
    ↓
Visualization (Kibana, Grafana)
```

**Example: Fluent Bit Configuration**:

```yaml
# fluent-bit.conf
[SERVICE]
    Flush        1
    Log_Level    info

[INPUT]
    Name         tail
    Path         /var/log/chef/*.log
    Parser       json
    Tag          chef.*

[FILTER]
    Name         parser
    Match        chef.*
    Key_Name     log
    Parser       json

[OUTPUT]
    Name         es
    Match        chef.*
    Host         elasticsearch
    Port         9200
    Index        chef-logs
    Type         _doc
```

## Monitoring and Alerting

### Log Levels and Alerting Thresholds

| Level | Severity | Alert | Action |
|-------|----------|-------|--------|
| TRACE | Debug | No | Development only |
| DEBUG | Debug | No | Troubleshooting |
| INFO | Normal | No | Standard operations |
| WARN | Warning | Yes | Investigate if frequent |
| ERROR | Error | Yes | Investigate immediately |
| FATAL | Critical | Yes | Page on-call engineer |

### Metrics to Monitor

1. **Log Volume**:
   - Logs per second
   - Total log size
   - Disk usage

2. **Error Rate**:
   - ERROR logs per minute
   - FATAL logs (should be zero)

3. **Performance**:
   - Pipeline duration (from logs)
   - Step durations
   - LLM response times

4. **Context Correlation**:
   - Thread IDs per hour (pipeline throughput)
   - Steps per pipeline (completeness)

### Example Monitoring Queries

**Elasticsearch (Kibana)**:

```json
{
  "query": {
    "bool": {
      "must": [
        { "match": { "level": "ERROR" } },
        { "range": { "@timestamp": { "gte": "now-5m" } } }
      ]
    }
  }
}
```

**CloudWatch Insights**:

```
fields @timestamp, threadId, step, msg, err.message
| filter level = "ERROR"
| sort @timestamp desc
| limit 100
```

## Security Considerations

### File Permissions

**Log File Permissions**:

```bash
# Create log directory with restricted permissions
mkdir -p /var/log/chef
chmod 750 /var/log/chef
chown chef:chef /var/log/chef

# Log files should be readable only by chef user
chmod 640 /var/log/chef/chef.log
```

### Sensitive Data Redaction

**Configure serializers to redact sensitive fields**:

```typescript
// @chef/core/logger/factory.ts
const logger = pino({
  serializers: {
    // Redact password fields
    user: (user) => ({
      id: user.id,
      email: user.email,
      // password excluded
    }),

    // Redact API keys
    config: (config) => ({
      ...config,
      apiKey: config.apiKey ? '[REDACTED]' : undefined,
      secret: '[REDACTED]'
    })
  }
});
```

### Compliance

**GDPR Considerations**:
- User data in logs requires consent
- Right to erasure: Delete logs on request
- Data retention: Configure LOG_RETENTION_DAYS appropriately

**PCI DSS**:
- Never log credit card numbers
- Mask PII in logs
- Encrypt logs at rest

## Performance Tuning

### Log Level Optimization

**Production**: Use `info` level to reduce volume

```bash
LOG_LEVEL=info  # Reduces logs by ~70% vs debug
```

**High Traffic**: Use `warn` level for critical systems

```bash
LOG_LEVEL=warn  # Only warnings and errors
```

### Conditional Logging

**Avoid expensive operations unless logging enabled**:

```typescript
if (logger.isLevelEnabled('debug')) {
  const debugInfo = expensiveComputation();
  logger.debug(debugInfo, 'Debug info');
}
```

### Async I/O

**Pino uses worker threads automatically (v7+)**:
- Main thread: Zero blocking
- Worker thread: File I/O, formatting
- Performance impact: <1%

### Sampling (Future)

**Log sampling for high-volume scenarios**:

```typescript
// Sample 10% of INFO logs, all ERROR logs
let sampleCounter = 0;

function shouldLog(level: string): boolean {
  if (level === 'error' || level === 'fatal') return true;
  return ++sampleCounter % 10 === 0;
}
```

## Troubleshooting

### Issue: Logs Not Appearing

**Check**:
1. `LOG_LEVEL` not set to `silent`
2. `NODE_ENV` set correctly
3. pino-pretty installed for development
4. Logger initialized before logging

**Fix**:

```bash
# Verify environment
echo $LOG_LEVEL  # Should not be "silent"
echo $NODE_ENV   # Should match your environment

# Check pino-pretty
pnpm list pino-pretty

# Re-initialize logger
resetLogger();
getLogger();
```

### Issue: Context Lost in Logs

**Check**:
1. `runPipeline()` called at entry point
2. `runStep()` used in pipeline nodes
3. `getContextLogger()` used instead of `getLogger()`

**Fix**:

```typescript
// Ensure pipeline wrapped
await runPipeline(threadId, async () => {
  // Ensure steps wrapped
  await runStep('stepName', async () => {
    // Use context logger
    const logger = getContextLogger();
    logger.info('Message');  // Includes threadId + step
  });
});
```

### Issue: File Rotation Not Working

**Check**:
1. `LOG_TO_FILE=true`
2. `LOG_FILE_PATH` directory exists
3. pino-roll installed
4. File permissions

**Fix**:

```bash
# Create directory
mkdir -p /var/log/chef

# Check permissions
ls -la /var/log/chef

# Verify pino-roll
pnpm list pino-roll

# Check configuration
echo $LOG_TO_FILE  # Should be "true"
echo $LOG_FILE_PATH
```

### Issue: High Memory Usage

**Cause**: Log backpressure (writing faster than disk can handle)

**Fix**:
1. Reduce log level
2. Enable log sampling
3. Increase rotation frequency
4. Use faster disk (SSD)

## References

- [Configuration Schema](../specifications/configuration-schema.md)
- [Integration Guide](../specifications/integration-guide.md)
- [Security Specification](../security/security-spec.md)
- [pino-roll Documentation](https://github.com/pinojs/pino-roll)
