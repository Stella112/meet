import Database from "better-sqlite3";
import type { Lot, News, RateObs, Status, StoredObligation } from "./types.js";

const toJson = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? { $big: x.toString() } : x));
const fromJson = <T>(s: string): T =>
  JSON.parse(s, (_k, x) => (x && typeof x === "object" && "$big" in x ? BigInt(x.$big) : x)) as T;

export interface LedgerRow {
  obligationId: string;
  label: string;
  venue: string;
  rule: string;
  routeReason: string;
  paidUsdt: bigint;
  deliveredCngn: bigint;
  vsStreet: string;
  vsDay1: string;
  buyTx: string;
  settleTx: string;
  at: number;
}

export class Store {
  private db: Database.Database;

  constructor(path = ":memory:") {
    this.db = new Database(path);
    this.db.exec(`
      create table if not exists obligations (id text primary key, status text not null, body text not null);
      create table if not exists ledger (id integer primary key autoincrement, obligation_id text not null, body text not null);
      create table if not exists events (id integer primary key autoincrement, at integer not null, obligation_id text, kind text not null, detail text not null);
      create table if not exists street (id integer primary key autoincrement, body text not null);
      create table if not exists paid_calls (id integer primary key autoincrement, day text not null, service text not null, atomic text not null, tx text, ok integer not null);
      create table if not exists news (id integer primary key autoincrement, at integer not null, value text not null);
    `);
  }

  add(o: StoredObligation): void {
    this.db.prepare("insert into obligations (id, status, body) values (?, ?, ?)").run(o.id, o.status, toJson(o));
  }

  save(o: StoredObligation): void {
    this.db.prepare("update obligations set status = ?, body = ? where id = ?").run(o.status, toJson(o), o.id);
  }

  get(id: string): StoredObligation | undefined {
    const r = this.db.prepare("select body from obligations where id = ?").get(id) as { body: string } | undefined;
    return r ? fromJson<StoredObligation>(r.body) : undefined;
  }

  open(): StoredObligation[] {
    const rows = this.db.prepare("select body from obligations where status in ('pending','bought')").all() as { body: string }[];
    return rows.map((r) => fromJson<StoredObligation>(r.body));
  }

  heldCost(): bigint {
    return this.open().reduce((sum, o) => sum + (o.lot?.usdtCost ?? 0n), 0n);
  }

  setLot(o: StoredObligation, lot: Lot | null, status: Status): void {
    o.lot = lot;
    o.status = status;
    this.save(o);
  }

  log(at: number, obligationId: string | null, kind: string, detail: string): void {
    this.db.prepare("insert into events (at, obligation_id, kind, detail) values (?, ?, ?, ?)").run(at, obligationId, kind, detail);
  }

  events(obligationId?: string): { kind: string; detail: string }[] {
    return (obligationId
      ? this.db.prepare("select kind, detail from events where obligation_id = ? order by id").all(obligationId)
      : this.db.prepare("select kind, detail from events order by id").all()) as { kind: string; detail: string }[];
  }

  addLedger(row: LedgerRow): void {
    this.db.prepare("insert into ledger (obligation_id, body) values (?, ?)").run(row.obligationId, toJson(row));
  }

  ledger(): LedgerRow[] {
    const rows = this.db.prepare("select body from ledger order by id").all() as { body: string }[];
    return rows.map((r) => fromJson<LedgerRow>(r.body));
  }

  /** Manual entry by Maris; shown as "manual, entered at <time>". */
  setStreet(obs: RateObs): void {
    this.db.prepare("insert into street (body) values (?)").run(toJson(obs));
  }

  street(): RateObs | null {
    const r = this.db.prepare("select body from street order by id desc limit 1").get() as { body: string } | undefined;
    return r ? fromJson<RateObs>(r.body) : null;
  }

  recordNews(at: number, value: News): void {
    this.db.prepare("insert into news (at, value) values (?, ?)").run(at, value);
  }

  lastNews(): { at: number; value: News } | null {
    return (this.db.prepare("select at, value from news order by id desc limit 1").get() as { at: number; value: News } | undefined) ?? null;
  }

  recordPaidCall(day: string, service: string, atomic: bigint, tx: string | null, ok: boolean): void {
    this.db.prepare("insert into paid_calls (day, service, atomic, tx, ok) values (?, ?, ?, ?, ?)").run(day, service, atomic.toString(), tx, ok ? 1 : 0);
  }

  /** Failed calls count too: a failure is "maybe paid". */
  spentOn(day: string): bigint {
    const rows = this.db.prepare("select atomic from paid_calls where day = ?").all(day) as { atomic: string }[];
    return rows.reduce((sum, r) => sum + BigInt(r.atomic), 0n);
  }
}
