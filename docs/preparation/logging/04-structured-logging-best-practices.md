# Structured Logging Best Practices (2025)

## Overview

Structured logging is the practice of outputting log entries in a machine-readable format (typically JSON) with consistent fields and schema. This enables efficient searching, filtering, and analysis in log management tools.

## Why Structured Logging?

### Traditional Text Logs

```
2025-01-15 10:30:45 INFO User john logged in from 192.168.1.100
2025-01-15 10:31:12 ERROR Failed to connect to database: connection timeout
```

**Problems**:
- Difficult to parse programmatically
- Inconsistent formats across different log sources
- Hard to filter by specific fields
- Requires regex parsing for analysis

### Structured JSON Logs

```json
{"timestamp":"2025-01-15T10:30:45.123Z","level":"info","userId":"john","ip":"192.168.1.100","event":"login"}
{"timestamp":"2025-01-15T10:31:12.456Z","level":"error","error":"connection timeout","service":"database"}
```

**Benefits**:
- Easy to parse and query
- Consistent schema
- Efficient filtering by any field
- Machine-readable without transformation

## Core Principles

### 1. Use JSON as the Standard Format

**Recommendation**: Output logs as newline-delimited JSON (ndjson) in production.

**Why JSON?**
- Universal and ubiquitous across platforms
- Human-readable and machine-parseable
- Easy to convert to other formats
- Native support in log management tools

```typescript
// Good: JSON-native logger like Pino
const logger = pino();
logger.info({ userId: '123', action: 'purchase', amount: 99.99 });

// Output: {"level":30,"time":1703251200000,"userId":"123","action":"purchase","amount":99.99}
```

### 2. Include Correlation IDs

**Correlation IDs** (also called trace IDs or request IDs) enable tracing requests across services and functions.

```typescript
// Generate unique ID per request
const requestId = crypto.randomUUID();

// Include in all logs for that request
logger.info({ requestId, event: 'request_received' });
logger.info({ requestId, event: 'database_query' });
logger.info({ requestId, event: 'response_sent' });
```

**Best Practices**:
- Generate correlation ID at entry point (API gateway, first service)
- Propagate through all services and functions
- Include in HTTP headers for downstream services
- Use consistent field name (`requestId`, `traceId`, etc.)

### 3. Use Appropriate Log Levels

Define clear criteria for each log level:

| Level | When to Use | Examples |
|-------|-------------|----------|
| **DEBUG** | Detailed diagnostic info for development | Variable values, function entry/exit |
| **INFO** | Normal operational messages | Request received, job completed |
| **WARN** | Warning conditions that should be reviewed | Deprecated API used, retry attempted |
| **ERROR** | Error conditions requiring attention | Failed to save record, API timeout |
| **FATAL** | Critical failures causing shutdown | Out of memory, corrupted database |

```typescript
logger.debug({ userId: '123', cart: [...items] }, 'Adding items to cart');
logger.info({ userId: '123', orderId: '456' }, 'Order created');
logger.warn({ userId: '123', apiVersion: 'v1' }, 'Using deprecated API version');
logger.error({ userId: '123', error: 'timeout' }, 'Payment processing failed');
logger.fatal({ error: 'out of memory' }, 'Application shutting down');
```

### 4. Add Contextual Information

Include relevant context to make logs actionable:

**Required Fields**:
- `timestamp`: ISO 8601 formatted timestamp
- `level`: Log severity level
- `message`: Human-readable message (optional with structured data)

**Recommended Fields**:
- `service`: Service or application name
- `version`: Application version
- `env`: Environment (dev, staging, production)
- `userId`: Authenticated user identifier
- `requestId`: Correlation ID
- `method`: HTTP method (for web requests)
- `url`: Request URL
- `statusCode`: HTTP status code
- `duration`: Operation duration in milliseconds

```typescript
logger.info({
  service: 'api',
  version: '1.2.3',
  env: 'production',
  userId: 'john',
  requestId: 'abc-123',
  method: 'POST',
  url: '/api/orders',
  statusCode: 201,
  duration: 145
}, 'Order created successfully');
```

### 5. Never Log Sensitive Data

**Never log**:
- Passwords
- API keys, tokens, secrets
- Credit card numbers
- Social security numbers
- Personal health information
- Unredacted email addresses (in some jurisdictions)

**Redaction Strategies**:

```typescript
// Use sanitization function
function sanitize(data: any) {
  const sanitized = { ...data };
  if (sanitized.password) sanitized.password = '[REDACTED]';
  if (sanitized.token) sanitized.token = '[REDACTED]';
  if (sanitized.ssn) sanitized.ssn = '[REDACTED]';
  return sanitized;
}

logger.info(sanitize(userData), 'User data processed');

// Or use Pino formatters
const logger = pino({
  formatters: {
    log: (object) => {
      if (object.password) object.password = '[REDACTED]';
      if (object.token) object.token = '[REDACTED]';
      return object;
    }
  }
});
```

**Alternative**: Log reference IDs instead of sensitive data:

```typescript
// Bad
logger.info({ creditCard: '4111-1111-1111-1111' });

// Good
logger.info({ paymentMethodId: 'pm_123abc' });
```

### 6. Structure Errors Properly

Include full error context for debugging:

```typescript
try {
  await processPayment(order);
} catch (err) {
  logger.error({
    error: {
      name: err.name,
      message: err.message,
      stack: err.stack,
      code: err.code
    },
    orderId: order.id,
    userId: order.userId,
    amount: order.total
  }, 'Payment processing failed');
}
```

Pino's built-in error serializer handles this automatically:

```typescript
try {
  await processPayment(order);
} catch (err) {
  logger.error(err, 'Payment processing failed');
  // Automatically includes error.message, error.stack, error.type
}
```

### 7. Use Consistent Field Names

Establish naming conventions across your application:

**Recommended Conventions**:
- Use camelCase for field names (`userId`, not `user_id`)
- Use consistent names across services (`requestId`, not `reqId` or `request_id`)
- Use descriptive names (`durationMs` instead of `duration` for clarity)
- Group related fields (`error.message`, `error.stack`, `error.code`)

```typescript
// Good: consistent naming
logger.info({
  userId: '123',
  requestId: 'abc',
  durationMs: 145,
  statusCode: 200
});

// Avoid: inconsistent naming
logger.info({
  user_id: '123',
  reqId: 'abc',
  duration: 145,
  status: 200
});
```

### 8. Log at Boundaries

Focus logging on critical boundaries and decision points:

**Key Boundaries**:
- Request entry (API endpoint, message queue)
- Request exit (response sent, message acknowledged)
- External service calls (database, third-party APIs)
- Error conditions
- State transitions (order created → processing → completed)

**Avoid**:
- Logging every function entry/exit in production
- Logging inside tight loops
- Excessive debug logs in production

```typescript
// Good: log at boundaries
app.post('/api/orders', async (req, res) => {
  req.log.info({ event: 'request_received' });

  const order = await createOrder(req.body);  // No log here

  req.log.info({ orderId: order.id, event: 'order_created' });

  const payment = await processPayment(order);  // No log here
  req.log.info({ orderId: order.id, paymentId: payment.id, event: 'payment_processed' });

  res.json(order);
  req.log.info({ orderId: order.id, statusCode: 200, event: 'request_completed' });
});
```

## Advanced Patterns

### Correlation with OpenTelemetry

Integrate structured logging with distributed tracing:

```typescript
import { trace } from '@opentelemetry/api';

const span = trace.getActiveSpan();
const traceId = span?.spanContext().traceId;
const spanId = span?.spanContext().spanId;

logger.info({
  traceId,
  spanId,
  message: 'Processing request'
});
```

### Log Sampling

Reduce log volume in high-throughput systems:

```typescript
// Sample 10% of debug logs
function shouldLog(level: string): boolean {
  if (level === 'debug') {
    return Math.random() < 0.1;  // 10% sampling
  }
  return true;  // Always log info, warn, error
}

if (shouldLog('debug')) {
  logger.debug({ data: largeObject }, 'Detailed debug info');
}
```

### Dynamic Log Levels

Change log levels at runtime without restart:

```typescript
let logLevel = process.env.LOG_LEVEL || 'info';

// Endpoint to change log level
app.post('/admin/log-level', (req, res) => {
  logLevel = req.body.level;
  logger.level = logLevel;
  res.json({ level: logLevel });
});
```

## Performance Considerations

### 1. Asynchronous Logging

Use async loggers to avoid blocking the main thread:

```typescript
// Pino is async by design (writes happen in worker threads)
const logger = pino();

// Winston requires configuration for async
const logger = winston.createLogger({
  transports: [
    new winston.transports.File({
      filename: 'app.log',
      flags: 'a',  // Append mode
      handleExceptions: true
    })
  ]
});
```

### 2. Avoid Expensive Operations

Don't perform expensive computations in log statements:

```typescript
// Bad: expensive JSON.stringify on every log (even if not logged)
logger.debug(JSON.stringify(largeObject));

// Good: only stringify if debug level is enabled
if (logger.isLevelEnabled('debug')) {
  logger.debug({ data: largeObject });
}

// Better: Pino handles this efficiently
logger.debug({ data: largeObject });  // Only serialized if level is debug
```

### 3. Log Volume Management

Prevent log explosion:

```typescript
// Use throttling for high-frequency events
import pThrottle from 'p-throttle';

const throttledLog = pThrottle({
  limit: 10,     // 10 logs
  interval: 1000 // per second
})(logger.warn.bind(logger));

// In high-frequency loop
for (const item of items) {
  if (item.hasWarning) {
    throttledLog({ itemId: item.id }, 'Item has warning');
  }
}
```

## Centralization and Aggregation

### 1. Send Logs to stdout

**Best Practice**: Log to stdout/stderr and let infrastructure handle routing.

```typescript
// Good: log to stdout
const logger = pino();

// Avoid: direct file writing in application code
// Let container orchestration (Docker, K8s) collect stdout
```

**Why?**
- Follows 12-factor app methodology
- Easier to aggregate in containerized environments
- Centralized log collection (Fluentd, Logstash, CloudWatch)

### 2. Use Centralized Log Management

Route logs to a centralized system:

- **Cloud**: CloudWatch Logs, Google Cloud Logging, Azure Monitor
- **Self-hosted**: ELK Stack (Elasticsearch, Logstash, Kibana), Grafana Loki
- **SaaS**: Datadog, Splunk, New Relic, Sumo Logic

### 3. Enable Log Search and Analysis

Structure logs to enable powerful queries:

```
# Find all failed payment attempts
level:error AND event:payment_failed

# Find slow requests (>1s duration)
durationMs:>1000

# Find specific user's activity
userId:123 AND timestamp:[2025-01-15 TO 2025-01-16]
```

## Common Anti-Patterns

### ❌ String Concatenation

```typescript
// Bad
logger.info('User ' + userId + ' performed action ' + action);

// Good
logger.info({ userId, action }, 'User performed action');
```

### ❌ Mixing Structured and Unstructured

```typescript
// Bad: mixes string formatting with objects
logger.info({ userId: '123' }, `User performed ${action}`);

// Good: fully structured
logger.info({ userId: '123', action }, 'User performed action');
```

### ❌ Logging Every Variable

```typescript
// Bad: too verbose
function processOrder(order) {
  logger.debug({ order }, 'Received order');
  logger.debug({ orderId: order.id }, 'Got order ID');
  logger.debug({ items: order.items }, 'Got order items');
  // ... excessive logging
}

// Good: log at meaningful points
function processOrder(order) {
  logger.info({ orderId: order.id, itemCount: order.items.length }, 'Processing order');
  // Process order...
  logger.info({ orderId: order.id, status: 'completed' }, 'Order processed');
}
```

### ❌ Inconsistent Schemas

```typescript
// Bad: different schemas for same event
logger.info({ userId: '123', action: 'login' });
logger.info({ user_id: '456', event: 'login' });  // Different field names

// Good: consistent schema
logger.info({ userId: '123', event: 'login' });
logger.info({ userId: '456', event: 'login' });
```

## Sources

- [11 Best Practices for Logging in Node.js - Better Stack](https://betterstack.com/community/guides/logging/nodejs-logging-best-practices/)
- [Node.js Logging Best Practices - Atatus](https://www.atatus.com/blog/best-practices-for-logging-in-node-js/)
- [Node.js Logging Best Practices - Datadog](https://www.datadoghq.com/blog/node-logging-best-practices/)
- [Best Practices for Logging in Node.js - AppSignal](https://blog.appsignal.com/2021/09/01/best-practices-for-logging-in-nodejs.html)
- [Structured Logging Best Practices - Uptrace](https://uptrace.dev/blog/structured-logging.html)
- [Top Node.js Logging Frameworks 2025 - Dash0](https://www.dash0.com/faq/the-top-5-best-node-js-and-javascript-logging-frameworks-in-2025-a-complete-guide)
- [Logging in Node.js - Better Stack](https://betterstack.com/community/guides/logging/best-nodejs-logging-libraries/)
- [Node.js Logging Libraries 2025 - Last9](https://last9.io/blog/node-js-logging-libraries/)
