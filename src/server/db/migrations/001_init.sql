-- Kerttervező – kezdeti adatséma
-- Dátumok: ISO 'YYYY-MM-DD'; időablakok: 'MM-DD'.
-- Kódolt értékek ékezet nélkül (pl. 'helyrevetes'), a felület fordítja magyarra.

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE plant_family (
  id                 INTEGER PRIMARY KEY,
  code               TEXT NOT NULL UNIQUE,
  name_hu            TEXT NOT NULL,
  name_latin         TEXT,
  rotation_gap_years INTEGER NOT NULL DEFAULT 3,
  notes              TEXT
);

-- Zöldségcsoport a fogyasztott / hasznosított rész szerint (vetésforgó-szakasz alapja)
CREATE TABLE crop_group (
  id             INTEGER PRIMARY KEY,
  code           TEXT NOT NULL UNIQUE,
  name_hu        TEXT NOT NULL,
  description    TEXT,
  rotation_stage TEXT CHECK (rotation_stage IN ('huvelyes', 'level', 'termes', 'gyoker')),
  sort_order     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE plant (
  id                    INTEGER PRIMARY KEY,
  code                  TEXT UNIQUE,
  name_hu               TEXT NOT NULL,
  name_latin            TEXT,
  family_id             INTEGER REFERENCES plant_family(id) ON DELETE SET NULL,
  crop_group_id         INTEGER REFERENCES crop_group(id) ON DELETE SET NULL,
  rotation_stage        TEXT CHECK (rotation_stage IN ('huvelyes', 'level', 'termes', 'gyoker')),
  nutrient_group        INTEGER CHECK (nutrient_group IN (1, 2, 3)),
  perennial             INTEGER NOT NULL DEFAULT 0,
  frost_sensitive       INTEGER NOT NULL DEFAULT 0,
  in_row_spacing_cm     INTEGER,
  row_spacing_cm        INTEGER,
  days_to_harvest       INTEGER,
  harvest_duration_days INTEGER,
  seed_viability_years  INTEGER,
  sun                   TEXT CHECK (sun IN ('napos', 'felarnyek', 'arnyek')),
  aliases_en            TEXT NOT NULL DEFAULT '[]',
  notes                 TEXT,
  data_status           TEXT NOT NULL DEFAULT 'sajat' CHECK (data_status IN ('alapertek', 'ellenorzott', 'sajat')),
  source                TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX plant_family_idx ON plant(family_id);
CREATE INDEX plant_group_idx ON plant(crop_group_id);

CREATE TABLE variety (
  id                INTEGER PRIMARY KEY,
  plant_id          INTEGER NOT NULL REFERENCES plant(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  description       TEXT,
  days_to_harvest   INTEGER,
  in_row_spacing_cm INTEGER,
  row_spacing_cm    INTEGER,
  notes             TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (plant_id, name)
);

-- Termesztési időszak (szezon). Egy növénynek / fajtának több is lehet.
CREATE TABLE growing_window (
  id                  INTEGER PRIMARY KEY,
  plant_id            INTEGER REFERENCES plant(id) ON DELETE CASCADE,
  variety_id          INTEGER REFERENCES variety(id) ON DELETE CASCADE,
  season              TEXT NOT NULL CHECK (season IN ('tavaszi', 'nyari', 'oszi', 'attelelo')),
  method              TEXT NOT NULL CHECK (method IN ('helyrevetes', 'palanta', 'ultetes')),
  sow_start           TEXT,
  sow_end             TEXT,
  seedling_weeks      INTEGER,
  transplant_start    TEXT,
  transplant_end      TEXT,
  harvest_start       TEXT,
  harvest_end         TEXT,
  harvest_year_offset INTEGER NOT NULL DEFAULT 0,
  succession_days     INTEGER,
  notes               TEXT,
  CHECK (plant_id IS NOT NULL OR variety_id IS NOT NULL)
);
CREATE INDEX window_plant_idx ON growing_window(plant_id);
CREATE INDEX window_variety_idx ON growing_window(variety_id);

CREATE TABLE companion (
  id         INTEGER PRIMARY KEY,
  plant_a_id INTEGER NOT NULL REFERENCES plant(id) ON DELETE CASCADE,
  plant_b_id INTEGER NOT NULL REFERENCES plant(id) ON DELETE CASCADE,
  relation   INTEGER NOT NULL CHECK (relation IN (-1, 0, 1)),
  reason     TEXT,
  source     TEXT NOT NULL DEFAULT 'user',
  evidence   TEXT,
  CHECK (plant_a_id < plant_b_id),
  UNIQUE (plant_a_id, plant_b_id)
);

CREATE TABLE seed_stock (
  id           INTEGER PRIMARY KEY,
  variety_id   INTEGER NOT NULL REFERENCES variety(id) ON DELETE CASCADE,
  supplier     TEXT,
  origin_type  TEXT NOT NULL DEFAULT 'vasarolt' CHECK (origin_type IN ('vasarolt', 'sajat', 'csere')),
  vintage_year INTEGER,
  in_stock     INTEGER NOT NULL DEFAULT 1,
  quantity     TEXT,
  notes        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX seed_variety_idx ON seed_stock(variety_id);

CREATE TABLE garden (
  id       INTEGER PRIMARY KEY,
  name     TEXT NOT NULL,
  location TEXT,
  notes    TEXT
);

CREATE TABLE bed (
  id               INTEGER PRIMARY KEY,
  garden_id        INTEGER NOT NULL REFERENCES garden(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  color            TEXT NOT NULL DEFAULT 'green',
  length_cm        INTEGER NOT NULL CHECK (length_cm > 0),
  width_cm         INTEGER NOT NULL CHECK (width_cm > 0),
  row_direction    TEXT NOT NULL DEFAULT 'keresztben' CHECK (row_direction IN ('keresztben', 'hosszaban')),
  pos_x_cm         INTEGER,
  pos_y_cm         INTEGER,
  rotation_deg     INTEGER NOT NULL DEFAULT 0,
  bed_type         TEXT NOT NULL DEFAULT 'foldagyas' CHECK (bed_type IN ('foldagyas', 'emelt', 'folia', 'uveghaz', 'cserep')),
  sun              TEXT CHECK (sun IN ('napos', 'felarnyek', 'arnyek')),
  soil             TEXT,
  irrigation       TEXT,
  notes            TEXT,
  active_from_year INTEGER,
  active_to_year   INTEGER,
  sort_order       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE plan_year (
  year   INTEGER PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'tervezes' CHECK (status IN ('tervezes', 'aktiv', 'lezart')),
  notes  TEXT
);

-- Ültetés: a terv és a tényleges megvalósulás központi rekordja.
CREATE TABLE planting (
  id                     INTEGER PRIMARY KEY,
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
  updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX planting_year_idx ON planting(year);
CREATE INDEX planting_bed_idx ON planting(bed_id);
CREATE INDEX planting_plant_idx ON planting(plant_id);

-- Generált feladatok állapota (a feladatok maguk a tervből számolódnak)
CREATE TABLE task_state (
  task_key TEXT PRIMARY KEY,
  done_at  TEXT,
  moved_to TEXT,
  note     TEXT
);

CREATE TABLE custom_task (
  id          INTEGER PRIMARY KEY,
  title       TEXT NOT NULL,
  due_date    TEXT NOT NULL,
  bed_id      INTEGER REFERENCES bed(id) ON DELETE SET NULL,
  planting_id INTEGER REFERENCES planting(id) ON DELETE CASCADE,
  notes       TEXT,
  done_at     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE journal_entry (
  id          INTEGER PRIMARY KEY,
  entry_date  TEXT NOT NULL,
  entry_type  TEXT NOT NULL DEFAULT 'megfigyeles'
              CHECK (entry_type IN ('megfigyeles', 'termes', 'betegseg', 'kartevo', 'problema', 'altalanos')),
  planting_id INTEGER REFERENCES planting(id) ON DELETE SET NULL,
  plant_id    INTEGER REFERENCES plant(id) ON DELETE SET NULL,
  variety_id  INTEGER REFERENCES variety(id) ON DELETE SET NULL,
  bed_id      INTEGER REFERENCES bed(id) ON DELETE SET NULL,
  body        TEXT NOT NULL DEFAULT '',
  amount      REAL,
  unit        TEXT,
  quality     INTEGER CHECK (quality BETWEEN 1 AND 5),
  tags        TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX journal_date_idx ON journal_entry(entry_date);

CREATE VIRTUAL TABLE journal_fts USING fts5(
  body, tags,
  content = 'journal_entry', content_rowid = 'id',
  tokenize = 'unicode61 remove_diacritics 2'
);
CREATE TRIGGER journal_ai AFTER INSERT ON journal_entry BEGIN
  INSERT INTO journal_fts(rowid, body, tags) VALUES (new.id, new.body, new.tags);
END;
CREATE TRIGGER journal_ad AFTER DELETE ON journal_entry BEGIN
  INSERT INTO journal_fts(journal_fts, rowid, body, tags) VALUES ('delete', old.id, old.body, old.tags);
END;
CREATE TRIGGER journal_au AFTER UPDATE ON journal_entry BEGIN
  INSERT INTO journal_fts(journal_fts, rowid, body, tags) VALUES ('delete', old.id, old.body, old.tags);
  INSERT INTO journal_fts(rowid, body, tags) VALUES (new.id, new.body, new.tags);
END;
