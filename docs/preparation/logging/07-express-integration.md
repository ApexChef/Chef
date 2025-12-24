# Express.js Logging Integration with Pino

## Overview

This document covers integrating Pino logging into Express.js applications using the `pino-http` middleware. This is relevant for the Chef web application (`@chef/web`).

## pino-http Middleware

`pino-http` is Express.js middleware that automatically logs HTTP requests and responses with detailed contextual information.

**Official Repository**: https://github.com/pinojs/pino-http
**npm Package**: https://www.npmjs.com/package/pino-http

### Key Features

- **Automatic request logging**: Logs each incoming request and outgoing response
- **Child loggers**: Creates a child logger per request with unique request ID
- **Performance**: Minimal overhead, leveraging Pino's speed
- **Customizable**: Custom log levels, serializers, and message formats

## Installation

```bash
pnpm add pino pino-http

# Development-only pretty printing
pnpm add -D pino-pretty
```

## Basic Integration

### Simple Setup

```typescript
import express from 'express';
import pino from 'pino';
import pinoHttp from 'pino-http';

const logger = pino();
const app = express();

// Add pino-http middleware
app.use(pinoHttp({ logger }));

app.get('/api/users', (req, res) => {
  req.log.info('Fetching users');  // Request-scoped logger
  res.json({ users: [] });
});

app.listen(3000, () => {
  logger.info('Server started on port 3000');
});
```

### With Custom Configuration

```typescript
import express from 'express';
import pino from 'pino';
import pinoHttp from 'pino-http';

const app = express();

app.use(pinoHttp({
  logger: pino(),
  autoLogging: true,          // Automatically log requests/responses
  customLogLevel: (req, res, err) => {
    if (res.statusCode >= 400 && res.statusCode < 500) {
      return 'warn';
    }
    if (res.statusCode >= 500 || err) {
      return 'error';
    }
    return 'info';
  },
  customSuccessMessage: (req, res) => {
    return `${req.method} ${req.url} completed`;
  },
  customErrorMessage: (req, res, err) => {
    return `${req.method} ${req.url} failed: ${err.message}`;
  }
}));

app.listen(3000);
```

## Configuration Options

### genReqId - Request ID Generation

Generate unique request IDs for correlation:

```typescript
import crypto from 'crypto';

app.use(pinoHttp({
  genReqId: (req, res) => {
    // Use existing request ID from header, or generate new one
    return req.headers['x-request-id'] as string || crypto.randomUUID();
  }
}));
```

Set request ID header in response:

```typescript
app.use(pinoHttp({
  genReqId: (req, res) => {
    const reqId = req.headers['x-request-id'] as string || crypto.randomUUID();
    res.setHeader('x-request-id', reqId);
    return reqId;
  }
}));
```

### autoLogging - Automatic Request/Response Logging

```typescript
app.use(pinoHttp({
  autoLogging: true,  // Log all requests/responses (default)
  autoLogging: false, // Disable automatic logging
  autoLogging: {
    ignore: (req) => req.url === '/health'  // Ignore health checks
  }
}));
```

### customLogLevel - Dynamic Log Levels

Set log level based on response status:

```typescript
app.use(pinoHttp({
  customLogLevel: (req, res, err) => {
    if (res.statusCode >= 400 && res.statusCode < 500) {
      return 'warn';  // 4xx → warn
    }
    if (res.statusCode >= 500 || err) {
      return 'error'; // 5xx or error → error
    }
    if (res.statusCode >= 300 && res.statusCode < 400) {
      return 'silent'; // 3xx → don't log redirects
    }
    return 'info';    // 2xx → info
  }
}));
```

### Serializers

Customize how request/response objects are logged:

```typescript
app.use(pinoHttp({
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      headers: {
        host: req.headers.host,
        userAgent: req.headers['user-agent']
      },
      // Omit other headers for brevity
    }),
    res: (res) => ({
      statusCode: res.statusCode,
      headers: res.getHeaders()
    }),
    err: pino.stdSerializers.err  // Use Pino's error serializer
  }
}));
```

### Custom Messages

```typescript
app.use(pinoHttp({
  customSuccessMessage: (req, res) => {
    return `${req.method} ${req.url} - ${res.statusCode}`;
  },
  customErrorMessage: (req, res, err) => {
    return `Request failed: ${err.message}`;
  },
  customAttributeKeys: {
    req: 'request',
    res: 'response',
    err: 'error',
    responseTime: 'duration'
  }
}));
```

## Request-Scoped Logger

`pino-http` attaches a child logger to `req.log`:

```typescript
app.get('/api/orders', async (req, res) => {
  // Each request has its own logger with unique request ID
  req.log.info('Fetching orders');

  const orders = await fetchOrders();
  req.log.info({ count: orders.length }, 'Orders fetched');

  res.json(orders);
});

// Output:
// {"level":30,"reqId":"abc-123","msg":"Fetching orders"}
// {"level":30,"reqId":"abc-123","count":42,"msg":"Orders fetched"}
```

### Passing Logger to Services

```typescript
// order-service.ts
export async function createOrder(logger: pino.Logger, data: OrderData) {
  logger.info({ data }, 'Creating order');
  // ...
  logger.info({ orderId: order.id }, 'Order created');
  return order;
}

// route handler
app.post('/api/orders', async (req, res) => {
  const order = await createOrder(req.log, req.body);
  res.json(order);
});
```

## Error Handling

Log errors with full context:

```typescript
app.get('/api/users/:id', async (req, res, next) => {
  try {
    const user = await fetchUser(req.params.id);
    if (!user) {
      req.log.warn({ userId: req.params.id }, 'User not found');
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    req.log.error(err, 'Error fetching user');
    next(err);
  }
});

// Error handler middleware
app.use((err, req, res, next) => {
  req.log.error(err, 'Unhandled error');
  res.status(500).json({
    error: 'Internal server error',
    requestId: req.id  // Include request ID for support
  });
});
```

## Environment-Based Configuration

```typescript
import pino from 'pino';
import pinoHttp from 'pino-http';

function createLogger() {
  const isDevelopment = process.env.NODE_ENV === 'development';

  return pino({
    level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
    transport: isDevelopment ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'yyyy-mm-dd HH:MM:ss',
        ignore: 'pid,hostname'
      }
    } : undefined
  });
}

const logger = createLogger();

app.use(pinoHttp({
  logger,
  autoLogging: process.env.NODE_ENV !== 'test',  // Disable in tests
  customLogLevel: (req, res, err) => {
    if (req.url === '/health' || req.url === '/metrics') {
      return 'silent';  // Don't log health checks
    }
    // ... rest of logic
  }
}));
```

## Filtering Sensitive Data

Redact sensitive information from logs:

```typescript
app.use(pinoHttp({
  serializers: {
    req: (req) => {
      const serialized = pino.stdSerializers.req(req);

      // Redact sensitive headers
      if (serialized.headers) {
        if (serialized.headers.authorization) {
          serialized.headers.authorization = '[REDACTED]';
        }
        if (serialized.headers.cookie) {
          serialized.headers.cookie = '[REDACTED]';
        }
      }

      return serialized;
    }
  }
}));

// Or use Pino's redact option
const logger = pino({
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]'
    ],
    remove: true  // Remove instead of replacing with [Redacted]
  }
});

app.use(pinoHttp({ logger }));
```

## Performance Monitoring

Track response times:

```typescript
app.use(pinoHttp({
  customSuccessMessage: (req, res) => {
    return `${req.method} ${req.url}`;
  },
  customAttributeKeys: {
    responseTime: 'durationMs'
  }
}));

// Logs include durationMs automatically:
// {"level":30,"durationMs":145,"reqId":"abc","method":"GET","url":"/api/users"}
```

Alert on slow requests:

```typescript
app.use((req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    if (duration > 1000) {  // Slow request (>1s)
      req.log.warn({ duration, url: req.url }, 'Slow request detected');
    }
  });

  next();
});
```

## Integration with AsyncLocalStorage

Combine pino-http with AsyncLocalStorage for global logger access:

```typescript
import { AsyncLocalStorage } from 'async_hooks';
import pinoHttp from 'pino-http';

const requestContext = new AsyncLocalStorage<pino.Logger>();

app.use(pinoHttp({ logger: pino() }));

// Store request logger in AsyncLocalStorage
app.use((req, res, next) => {
  requestContext.run(req.log, () => {
    next();
  });
});

// Access logger anywhere in the request chain
export function getLogger(): pino.Logger {
  return requestContext.getStore() || pino();
}

// In services (no need to pass logger)
async function createOrder(data: OrderData) {
  const logger = getLogger();
  logger.info({ data }, 'Creating order');
  // ...
}

// In route handlers
app.post('/api/orders', async (req, res) => {
  const order = await createOrder(req.body);  // Logger accessed via AsyncLocalStorage
  res.json(order);
});
```

## Health Check Endpoints

Exclude health checks from logs:

```typescript
app.use(pinoHttp({
  autoLogging: {
    ignore: (req) => {
      const healthPaths = ['/health', '/healthz', '/ready', '/live'];
      return healthPaths.includes(req.url);
    }
  }
}));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });  // Not logged
});

app.get('/api/users', (req, res) => {
  res.json({ users: [] });  // Logged
});
```

## Testing

Disable logging in tests:

```typescript
// logger.ts
export function createLogger() {
  const isTest = process.env.NODE_ENV === 'test';

  return pino({
    level: isTest ? 'silent' : process.env.LOG_LEVEL || 'info',
    enabled: !isTest
  });
}

// Or in test setup
import pino from 'pino';
import { beforeEach } from 'vitest';

beforeEach(() => {
  pino.final(pino(), (err, finalLogger, evt) => {
    finalLogger.level = 'silent';
  });
});
```

## Complete Example

```typescript
import express from 'express';
import pino from 'pino';
import pinoHttp from 'pino-http';
import crypto from 'crypto';
import { AsyncLocalStorage } from 'async_hooks';

// Create base logger
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'yyyy-mm-dd HH:MM:ss',
      ignore: 'pid,hostname'
    }
  } : undefined
});

// AsyncLocalStorage for global logger access
const requestContext = new AsyncLocalStorage<pino.Logger>();

export function getLogger(): pino.Logger {
  return requestContext.getStore() || logger;
}

// Create Express app
const app = express();
app.use(express.json());

// pino-http middleware
app.use(pinoHttp({
  logger,
  genReqId: (req, res) => {
    const reqId = req.headers['x-request-id'] as string || crypto.randomUUID();
    res.setHeader('x-request-id', reqId);
    return reqId;
  },
  autoLogging: {
    ignore: (req) => ['/health', '/metrics'].includes(req.url)
  },
  customLogLevel: (req, res, err) => {
    if (res.statusCode >= 400 && res.statusCode < 500) return 'warn';
    if (res.statusCode >= 500 || err) return 'error';
    return 'info';
  },
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      headers: {
        host: req.headers.host,
        userAgent: req.headers['user-agent']
      }
    }),
    res: pino.stdSerializers.res,
    err: pino.stdSerializers.err
  }
}));

// Store logger in AsyncLocalStorage
app.use((req, res, next) => {
  requestContext.run(req.log, () => {
    next();
  });
});

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/users', async (req, res, next) => {
  try {
    getLogger().info('Fetching users');
    const users = await fetchUsers();
    res.json(users);
  } catch (err) {
    next(err);
  }
});

// Error handler
app.use((err, req, res, next) => {
  req.log.error(err, 'Unhandled error');
  res.status(500).json({
    error: 'Internal server error',
    requestId: req.id
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info({ port: PORT }, 'Server started');
});
```

## Best Practices

1. **Use request-scoped loggers**: Always use `req.log` instead of global logger in route handlers
2. **Generate request IDs**: Include request IDs in responses for debugging
3. **Exclude health checks**: Prevent log noise from health check endpoints
4. **Log errors with context**: Include request ID, user ID, and error details
5. **Use appropriate log levels**: info for normal operations, warn for 4xx, error for 5xx
6. **Redact sensitive data**: Never log passwords, tokens, or PII
7. **Monitor performance**: Track response times and alert on slow requests
8. **Test without logs**: Disable logging in tests to reduce noise

## Sources

- [pino-http GitHub Repository](https://github.com/pinojs/pino-http)
- [Pino Logger Guide 2025 - SigNoz](https://signoz.io/guides/pino-logger/)
- [Production-Grade Logging with Pino - Dash0](https://www.dash0.com/guides/logging-in-node-js-with-pino)
- [Complete Guide to Pino - Better Stack](https://betterstack.com/community/guides/logging/how-to-install-setup-and-use-pino-to-log-node-js-applications/)
- [JSON Logging with Pino in Express.js](https://traveling-coderman.net/code/node-architecture/logging/)
- [Setup Logging with Pino and Express](https://techinsights.manisuec.com/nodejs/pino-logger-express-http-context/)
- [Pino Logger - Last9](https://last9.io/blog/npm-pino-logger/)
