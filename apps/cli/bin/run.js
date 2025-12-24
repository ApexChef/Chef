#!/usr/bin/env -S node --no-warnings

import "dotenv/config";
import { execute } from "@oclif/core";

await execute({ dir: import.meta.url });
