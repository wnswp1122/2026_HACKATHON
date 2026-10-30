CREATE TABLE IF NOT EXISTS instances (
    instance_id text PRIMARY KEY,
    last_received_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
    event_id uuid PRIMARY KEY,
    instance_id text NOT NULL REFERENCES instances(instance_id),
    message_id uuid NOT NULL,
    schema_version text NOT NULL,
    source text NOT NULL CHECK (source IN ('live', 'sample')),
    received_at timestamptz NOT NULL,
    raw_event jsonb NOT NULL,
    normalized jsonb NOT NULL,
    UNIQUE (instance_id, message_id)
);
CREATE INDEX IF NOT EXISTS events_received_idx ON events(received_at DESC, event_id DESC);
CREATE INDEX IF NOT EXISTS events_instance_received_idx ON events(instance_id, received_at DESC);
CREATE TABLE IF NOT EXISTS snapshots (
    snapshot_id uuid PRIMARY KEY,
    created_at timestamptz NOT NULL,
    payload jsonb NOT NULL,
    image_png bytea,
    image_sha256 text
);
CREATE TABLE IF NOT EXISTS analyses (
    analysis_id uuid PRIMARY KEY,
    snapshot_id uuid NOT NULL UNIQUE REFERENCES snapshots(snapshot_id),
    created_at timestamptz NOT NULL,
    model text NOT NULL,
    instruction_version text NOT NULL,
    result jsonb NOT NULL
);
