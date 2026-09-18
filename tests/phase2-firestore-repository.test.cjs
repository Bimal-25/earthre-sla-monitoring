const test = require('node:test');
const assert = require('node:assert/strict');

const { FirestoreUploadRepository } = require('../dist');

class FakeSnapshot {
  constructor(data) {
    this._data = data;
    this.exists = data !== undefined;
  }
  data() {
    return structuredClone(this._data);
  }
}

class FakeDocumentRef {
  constructor(db, path) {
    this.db = db;
    this.path = path;
  }
  collection(name) {
    return new FakeCollectionRef(this.db, `${this.path}/${name}`);
  }
  async get() {
    return new FakeSnapshot(this.db.documents.get(this.path));
  }
  async set(data, options) {
    const current = this.db.documents.get(this.path);
    const next = options?.merge && current ? { ...current, ...structuredClone(data) } : structuredClone(data);
    this.db.documents.set(this.path, next);
  }
}

class FakeQuery {
  constructor(db, path, state = {}) {
    this.db = db;
    this.path = path;
    this.state = {
      filters: state.filters ?? [],
      orderField: state.orderField,
      orderDirection: state.orderDirection ?? 'asc',
      after: state.after,
      limitValue: state.limitValue,
    };
  }
  clone(patch) {
    return new FakeQuery(this.db, this.path, { ...this.state, ...patch });
  }
  where(field, op, value) {
    return this.clone({ filters: [...this.state.filters, { field, op, value }] });
  }
  orderBy(field, direction = 'asc') {
    return this.clone({ orderField: field, orderDirection: direction });
  }
  startAfter(value) {
    return this.clone({ after: value });
  }
  limit(value) {
    return this.clone({ limitValue: value });
  }
  async get() {
    const prefix = `${this.path}/`;
    let values = [...this.db.documents.entries()]
      .filter(([key]) => key.startsWith(prefix) && !key.slice(prefix.length).includes('/'))
      .map(([, value]) => structuredClone(value));

    for (const filter of this.state.filters) {
      values = values.filter((value) => {
        const actual = value[filter.field];
        switch (filter.op) {
          case '==': return actual === filter.value;
          case '>=': return actual >= filter.value;
          case '<=': return actual <= filter.value;
          case '<': return actual < filter.value;
          default: throw new Error(`Unsupported fake query operator ${filter.op}`);
        }
      });
    }

    if (this.state.orderField) {
      const field = this.state.orderField;
      const direction = this.state.orderDirection === 'desc' ? -1 : 1;
      values.sort((a, b) => String(a[field]).localeCompare(String(b[field])) * direction);
      if (this.state.after !== undefined) {
        values = values.filter((value) => String(value[field]) > String(this.state.after));
      }
    }

    if (this.state.limitValue !== undefined) {
      values = values.slice(0, this.state.limitValue);
    }

    return { docs: values.map((value) => new FakeSnapshot(value)) };
  }
}

class FakeCollectionRef extends FakeQuery {
  doc(id) {
    return new FakeDocumentRef(this.db, `${this.path}/${id}`);
  }
}

class FakeFirestore {
  constructor() {
    this.documents = new Map();
  }
  collection(name) {
    return new FakeCollectionRef(this, name);
  }
  async runTransaction(fn) {
    const transaction = {
      get: (ref) => ref.get(),
      set: (ref, data) => {
        this.documents.set(ref.path, structuredClone(data));
        return transaction;
      },
    };
    return fn(transaction);
  }
  batch() {
    const pending = [];
    return {
      set(ref, data) {
        pending.push([ref, structuredClone(data)]);
        return this;
      },
      commit: async () => {
        for (const [ref, data] of pending) {
          this.documents.set(ref.path, data);
        }
      },
    };
  }
}

function processingClaim(uploadId, now = '2026-09-17T00:00:00.000Z') {
  return {
    uploadId,
    fileHash: uploadId,
    filename: 'checks.csv',
    nowUtc: now,
  };
}

test('Firestore repository claims uploads transactionally and allows failed upload retry', async () => {
  const firestore = new FakeFirestore();
  const repository = new FirestoreUploadRepository({ firestore });
  const uploadId = 'b'.repeat(64);

  const first = await repository.claimUpload(processingClaim(uploadId));
  assert.equal(first.state, 'claimed');
  assert.equal(first.upload.status, 'processing');

  const second = await repository.claimUpload(processingClaim(uploadId));
  assert.equal(second.state, 'processing');

  await repository.markUploadFailed(
    uploadId,
    { code: 'INVALID_CSV', message: 'bad file' },
    '2026-09-17T00:01:00.000Z',
  );

  const retry = await repository.claimUpload(
    processingClaim(uploadId, '2026-09-17T00:02:00.000Z'),
  );
  assert.equal(retry.state, 'claimed');
  assert.equal(retry.upload.status, 'processing');
  assert.equal(retry.upload.failure, null);
});

test('Firestore repository writes children before completed parent and supports summary/log queries', async () => {
  const firestore = new FakeFirestore();
  const repository = new FirestoreUploadRepository({ firestore });
  const uploadId = 'c'.repeat(64);
  const claim = await repository.claimUpload(processingClaim(uploadId));

  const upload = {
    ...claim.upload,
    status: 'complete',
    processedAt: '2026-09-17T00:01:00.000Z',
    updatedAt: '2026-09-17T00:01:00.000Z',
    rangeStartUtc: '2025-05-08T00:00:00.000Z',
    rangeEndUtc: '2025-05-08T00:15:00.000Z',
    rangeStartDate: '2025-05-08',
    rangeEndDate: '2025-05-08',
    services: [{ serviceId: 'svc-a', serviceName: 'alpha' }],
  };

  const observation = (id, time) => ({
    observationId: id,
    uploadId,
    sortKey: `${time}|${id}`,
    sourceRow: 2,
    sourceRows: [2],
    duplicateCount: 1,
    raw: {
      service_id: 'svc-a', service_name: 'alpha', timestamp: time,
      status_code: '200', latency: '10', latency_unit: 'ms', agent: 'a1', region: 'r1',
    },
    serviceId: 'svc-a',
    serviceName: 'alpha',
    agent: 'a1',
    region: 'r1',
    timestampRaw: time,
    timestampUtc: time,
    dateUtc: '2025-05-08',
    isOnExpectedCadence: true,
    statusCodeRaw: '200',
    statusCode: 200,
    healthState: 'healthy',
    latencyRaw: '10',
    latencyUnitRaw: 'ms',
    latencyMs: 10,
    intervalKey: `svc-a\\0${time}`,
    issues: [],
  });

  const observations = [
    observation('obs-1', '2025-05-08T00:00:00.000Z'),
    observation('obs-2', '2025-05-08T00:15:00.000Z'),
  ];

  const dailyStat = {
    dailyStatId: '2025-05-08--svc-a',
    uploadId,
    date: '2025-05-08',
    serviceId: 'svc-a',
    serviceName: 'alpha',
    expectedIntervals: 2,
    healthyIntervals: 2,
    downIntervals: 0,
    unknownIntervals: 0,
    conflictedIntervals: 0,
    resolvedIntervals: 2,
    unresolvedIntervals: 0,
    detectedDowntimeMinutes: 0,
    latencySamplesMs: [10, 10],
    issueCounts: {},
    intervalStateCounts: { healthy: 2, down: 0, unknown: 0, conflicted: 0 },
  };

  await repository.completeUpload(upload, observations, [dailyStat]);

  const persisted = await repository.getUpload(uploadId);
  assert.equal(persisted.status, 'complete');

  const stats = await repository.getDailyStats(uploadId, '2025-05-08', '2025-05-08');
  assert.equal(stats.length, 1);
  assert.equal(stats[0].expectedIntervals, 2);

  const firstPage = await repository.listObservations(uploadId, {
    fromSortKeyInclusive: '2025-05-08T00:00:00.000Z|',
    toSortKeyExclusive: '2025-05-09T00:00:00.000Z|',
    serviceId: 'svc-a',
    pageSize: 1,
  });
  assert.equal(firstPage.items.length, 1);
  assert.ok(firstPage.nextSortKey);

  const secondPage = await repository.listObservations(uploadId, {
    fromSortKeyInclusive: '2025-05-08T00:00:00.000Z|',
    toSortKeyExclusive: '2025-05-09T00:00:00.000Z|',
    serviceId: 'svc-a',
    pageSize: 1,
    afterSortKey: firstPage.nextSortKey,
  });
  assert.equal(secondPage.items.length, 1);
  assert.equal(secondPage.nextSortKey, null);
  assert.notEqual(secondPage.items[0].observationId, firstPage.items[0].observationId);
});
