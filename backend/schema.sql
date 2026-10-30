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

-- d960d3f 화면 계약: 기존 이벤트/스냅샷을 갱신하지 않는 additive migration.
-- 상태만 전송하는 인스턴스도 허용하므로 instances FK를 두지 않는다.
CREATE TABLE IF NOT EXISTS sensor_reports (
    report_id uuid PRIMARY KEY,
    instance_id text NOT NULL,
    message_id uuid NOT NULL,
    source text NOT NULL CHECK (source IN ('live', 'sample')),
    observed_at timestamptz NOT NULL,
    received_at timestamptz NOT NULL,
    payload jsonb NOT NULL,
    UNIQUE (instance_id, message_id)
);
CREATE INDEX IF NOT EXISTS sensor_reports_instance_source_observed_idx
    ON sensor_reports(instance_id, source, observed_at DESC, received_at DESC);
CREATE TABLE IF NOT EXISTS replays (
    replay_id uuid PRIMARY KEY,
    created_at timestamptz NOT NULL,
    payload jsonb NOT NULL
);

-- 고정 조사와 이벤트별 AI 결과. Replay payload/기존 Snapshot은 수정하지 않는다.
CREATE TABLE IF NOT EXISTS replay_analyses (
    replay_id uuid NOT NULL REFERENCES replays(replay_id),
    focus_key text NOT NULL,
    response jsonb NOT NULL,
    PRIMARY KEY (replay_id, focus_key)
);
