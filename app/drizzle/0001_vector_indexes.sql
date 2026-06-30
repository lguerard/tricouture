-- Index HNSW pour la recherche sémantique (cosine distance).
-- pgvector >= 0.5.0 requis (Postgres 16 + pgvector dans l'image de base).
CREATE INDEX IF NOT EXISTS patterns_embedding_hnsw
    ON patterns USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS yarns_embedding_hnsw
    ON yarns USING hnsw (embedding vector_cosine_ops);
