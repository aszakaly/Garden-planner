-- A törölt ültetés azonosítója ne kerüljön újra kiosztásra (AUTOINCREMENT): a munkalapon gyakori
-- a törlés és az új sáv, és egy régi azonosítóra mutató hivatkozás (pl. egy nyitva hagyott lap)
-- így sosem kerülhet egy másik ültetésre.
-- SQLite-ban ez csak a tábla újraépítésével állítható be (a migrációfuttató kikapcsolja az
-- idegenkulcs-ellenőrzést, a végén pedig ellenőrzi). Az oszlopok sorrendje változatlan, így az
-- export is ugyanolyan marad.

CREATE TABLE planting_new (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  year                   INTEGER NOT NULL CHECK (year BETWEEN 1900 AND 2200),
  plant_id               INTEGER NOT NULL REFERENCES plant(id),
  variety_id             INTEGER REFERENCES variety(id) ON DELETE SET NULL,
  seed_stock_id          INTEGER REFERENCES seed_stock(id) ON DELETE SET NULL,
  bed_id                 INTEGER REFERENCES bed(id) ON DELETE SET NULL,
  axis_start_cm          REAL,
  axis_span_cm           REAL,
  cross_start_cm         REAL,
  cross_span_cm          REAL,
  rows                   INTEGER,
  plant_count            INTEGER,
  method                 TEXT CHECK (method IN ('helyrevetes', 'palanta', 'vasarolt_palanta', 'ultetes')),
  window_id              INTEGER REFERENCES growing_window(id) ON DELETE SET NULL,
  plan_sow_date          TEXT,
  plan_transplant_date   TEXT,
  plan_harvest_start     TEXT,
  plan_end_date          TEXT,
  actual_sow_date        TEXT,
  actual_transplant_date TEXT,
  actual_harvest_start   TEXT,
  actual_end_date        TEXT,
  actual_bed_id          INTEGER REFERENCES bed(id) ON DELETE SET NULL,
  actual_axis_start_cm   REAL,
  actual_axis_span_cm    REAL,
  actual_cross_start_cm  REAL,
  actual_cross_span_cm   REAL,
  status                 TEXT NOT NULL DEFAULT 'terv' CHECK (status IN ('terv', 'folyamatban', 'lezart', 'elmaradt', 'sikertelen')),
  is_history             INTEGER NOT NULL DEFAULT 0,
  series_id              TEXT,
  series_index           INTEGER,
  eval_success           INTEGER CHECK (eval_success BETWEEN 1 AND 5),
  eval_yield             TEXT,
  eval_recommend         TEXT CHECK (eval_recommend IN ('igen', 'nem', 'talan')),
  eval_notes             TEXT,
  notes                  TEXT,
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at             TEXT NOT NULL DEFAULT (datetime('now')),
  carried_from_id        INTEGER
);

INSERT INTO planting_new (
  id, year, plant_id, variety_id, seed_stock_id, bed_id, axis_start_cm, axis_span_cm, cross_start_cm, cross_span_cm,
  rows, plant_count, method, window_id, plan_sow_date, plan_transplant_date, plan_harvest_start, plan_end_date,
  actual_sow_date, actual_transplant_date, actual_harvest_start, actual_end_date, actual_bed_id,
  actual_axis_start_cm, actual_axis_span_cm, actual_cross_start_cm, actual_cross_span_cm, status, is_history,
  series_id, series_index, eval_success, eval_yield, eval_recommend, eval_notes, notes, created_at, updated_at,
  carried_from_id
)
SELECT
  id, year, plant_id, variety_id, seed_stock_id, bed_id, axis_start_cm, axis_span_cm, cross_start_cm, cross_span_cm,
  rows, plant_count, method, window_id, plan_sow_date, plan_transplant_date, plan_harvest_start, plan_end_date,
  actual_sow_date, actual_transplant_date, actual_harvest_start, actual_end_date, actual_bed_id,
  actual_axis_start_cm, actual_axis_span_cm, actual_cross_start_cm, actual_cross_span_cm, status, is_history,
  series_id, series_index, eval_success, eval_yield, eval_recommend, eval_notes, notes, created_at, updated_at,
  carried_from_id
FROM planting;

DROP TABLE planting;
ALTER TABLE planting_new RENAME TO planting;

CREATE INDEX planting_year_idx ON planting(year);
CREATE INDEX planting_bed_idx ON planting(bed_id);
CREATE INDEX planting_plant_idx ON planting(plant_id);
CREATE INDEX planting_carried_idx ON planting(carried_from_id);
