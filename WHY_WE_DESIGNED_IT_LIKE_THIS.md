# Why We Designed It Like This

This document explains the architectural decisions behind the analytics tracker and what to do when traffic grows.

---

## Current Architecture

```
Browser → API Gateway → Lambda → S3 (JSON, one file per event)
```

Each analytics event is written immediately to S3 as an individual JSON file, partitioned by date:

```
analytics/year=2026/month=03/day=10/{eventId}.json
```

### Why this is the right choice right now

The site receives fewer than 100 events per day. At that volume:

- One file per event is perfectly fine — S3 handles it with no issues
- JSON is human-readable and easy to debug
- The Lambda writes directly to S3 with no intermediate services
- There is nothing to maintain, nothing to fail, nothing to tune

Adding Parquet conversion, Firehose buffering, or Glue ETL jobs at this scale would be real engineering work with zero measurable benefit. Those tools exist to solve problems we do not have yet.

---

## S3 Bucket Structure

| Bucket | Purpose |
|--------|---------|
| `test-analytics-gtng` | Raw analytics events written by Lambda |
| `test-analytics-output` | Metadata storage and processed output |

Both buckets have:
- **Versioning enabled** — deleted objects can be recovered from previous versions
- **Deny-delete policy** — all delete actions are blocked for every principal except the AWS account root user, preventing accidental or malicious data loss

---

## Querying with Athena

At current scale, Athena can query the raw JSON directly. A full day's partition (< 100 files, ~1-2KB each) scans in milliseconds and costs fractions of a cent. No schema optimisation is needed.

To query, define a table in Athena pointing at the `analytics/` prefix with the Hive partition scheme (`year=`, `month=`, `day=`) already in place.

---

## When to Revisit: The Scaling Path

### Problem 1 — Many small files

At ~10,000+ events/day, S3 accumulates thousands of tiny files per partition. Athena opens each file as a separate S3 GET request before reading any data, making queries slow and more expensive relative to actual data size.

AWS recommends files between 128MB and 1GB for Athena. At scale, thousands of 1-2KB files per partition is the opposite of that.

**Fix: Add a nightly Glue ETL compaction job**

Leave the Lambda unchanged. Add a Glue ETL job that runs nightly, reads all small JSON files for the previous day's partition, and rewrites them as one or two large Parquet files in a `processed/` prefix. Athena queries point at `processed/` instead of `analytics/`.

```
Lambda → S3 (raw JSON, landing zone)
                ↓
         Glue ETL (nightly)
                ↓
         S3 (Parquet, processed/)  ← Athena queries here
```

This is the least invasive change — the Lambda and ingestion path stay exactly as they are.

### Problem 2 — File format (JSON vs Parquet/ORC)

JSON is verbose and row-oriented. Athena must read entire records even when a query only needs two columns. Parquet and ORC are columnar — Athena skips irrelevant columns entirely, reducing data scanned and therefore cost.

At current scale this makes no measurable difference. At millions of events per day it matters significantly.

**Parquet/ORC cannot be written one row at a time.** They are batch formats that require many rows and write schema metadata in a file footer. Writing a one-row Parquet file per event would be worse than JSON — all the overhead, none of the benefit. This is why file format and the small files problem are solved together.

The Glue ETL compaction job above handles both: it batches thousands of JSON records into a single Parquet file.

### Problem 3 — Query latency on today's data

The nightly Glue ETL approach means today's events only become queryable in the processed layer the following morning. If real-time or same-day querying matters:

**Fix: Replace direct S3 writes with Kinesis Firehose**

Change the Lambda to put events onto a Firehose stream instead of writing directly to S3. Firehose buffers events (configurable — e.g. every 5 minutes or every 128MB, whichever comes first) and writes batched Parquet files automatically, integrating with the Glue Data Catalog for schema management.

```
API Gateway → Lambda → Firehose → S3 (Parquet, batched every ~5 min)
```

This solves all three problems at once — no small files, columnar format, data available within minutes. The trade-off is added operational complexity (Firehose stream, IAM roles, Glue schema management) and a small ingestion cost (~$0.029/GB).

---

## Decision Summary

| Scenario | Action |
|----------|--------|
| < 10k events/day | Do nothing. Current architecture is correct. |
| 10k–1M events/day, next-day querying acceptable | Add Glue ETL compaction job |
| 10k–1M events/day, same-day querying needed | Switch to Firehose |
| > 1M events/day | Firehose + evaluate DynamoDB or a dedicated OLAP store |

---

## What We Are Not Using (and Why)

**AWS Glue** — not configured yet. At current scale there is no schema to crawl and no ETL to run. When the compaction job becomes necessary, a Glue Crawler should be added to maintain the Data Catalog automatically alongside it.

**Parquet/ORC** — not used because the Lambda writes one event at a time. These formats require batch writes and would provide no benefit, and some overhead, at the per-event level.

**Kinesis Firehose** — not used because the added complexity (stream management, buffering delays, Glue schema dependency) is not justified at fewer than 100 events/day.
