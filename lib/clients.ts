import { QdrantVector } from '@mastra/qdrant';
import Redis from 'ioredis';
import neo4j, { type Driver } from 'neo4j-driver';

export const QDRANT_INDEX_NAME = 'memories';
export const EMBEDDING_DIMENSION = parseInt(process.env.EMBEDDING_DIMENSION || '768'); // nomic-embed-text default

let qdrantInstance: QdrantVector | null = null;
let redisInstance: Redis | null = null;
let neo4jInstance: Driver | null = null;

function resolveRedisUrl(): string {
  if (process.env.REDIS_URL) return process.env.REDIS_URL;
  const host = process.env.REDIS_HOST || '127.0.0.1';
  const port = process.env.REDIS_PORT || '6379';
  return `redis://${host}:${port}`;
}

function resolveQdrantUrl(): string {
  if (process.env.QDRANT_URL) return process.env.QDRANT_URL;
  const host = process.env.QDRANT_HOST || '127.0.0.1';
  const port = process.env.QDRANT_PORT || '6333';
  return `http://${host}:${port}`;
}

function resolveNeo4jUrl(): string {
  if (process.env.NEO4J_URL) return process.env.NEO4J_URL;
  const host = process.env.NEO4J_HOST || '127.0.0.1';
  // Astropods injects the HTTP port (7474), but we need the bolt port (7687)
  return `bolt://${host}:7687`;
}

export function getQdrant(): QdrantVector {
  if (!qdrantInstance) {
    qdrantInstance = new QdrantVector({
      id: 'memory-box-qdrant',
      url: resolveQdrantUrl(),
    });
  }
  return qdrantInstance;
}

export function getRedis(): Redis {
  if (!redisInstance) {
    redisInstance = new Redis(resolveRedisUrl());
  }
  return redisInstance;
}

export function getNeo4j(): Driver {
  if (!neo4jInstance) {
    neo4jInstance = neo4j.driver(
      resolveNeo4jUrl(),
      neo4j.auth.basic('neo4j', 'neo4j'),
    );
  }
  return neo4jInstance;
}
